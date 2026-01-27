import { Joint, ScaleData, Point } from '../types';

// Note: OpenCV.js needs to be loaded in index.html
declare const cv: any;

interface DetectionParameters {
  cannyLow: number;
  cannyHigh: number;
  houghThreshold: number;
  minLineLength: number;
  maxLineGap: number;
}

interface LineSegment {
  start: Point;
  end: Point;
  angle: number;
  length: number;
}

// Calculate angle of a line segment (in degrees, 0-180)
const getLineAngle = (start: Point, end: Point): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  // Normalize to 0-180 range (lines are bidirectional)
  if (angle < 0) angle += 180;
  if (angle >= 180) angle -= 180;
  return angle;
};

// Remove duplicate/overlapping lines - keeps the longest version
const removeDuplicateLines = (segments: LineSegment[], threshold: number = 15): LineSegment[] => {
  // Sort by length descending - prefer longer lines
  const sorted = [...segments].sort((a, b) => b.length - a.length);
  const result: LineSegment[] = [];
  
  for (const segment of sorted) {
    let isDuplicate = false;
    
    for (const existing of result) {
      // Check if endpoints are very close (same line detected twice)
      const startDist1 = calculateDistance(segment.start, existing.start);
      const endDist1 = calculateDistance(segment.end, existing.end);
      const startDist2 = calculateDistance(segment.start, existing.end);
      const endDist2 = calculateDistance(segment.end, existing.start);
      
      // Either both endpoints match in order, or swapped
      const match1 = startDist1 < threshold && endDist1 < threshold;
      const match2 = startDist2 < threshold && endDist2 < threshold;
      
      if (match1 || match2) {
        isDuplicate = true;
        break;
      }
      
      // Check if this segment is contained within an existing longer segment
      // by checking if both endpoints are close to the existing line
      const mid1 = {
        x: (segment.start.x + segment.end.x) / 2,
        y: (segment.start.y + segment.end.y) / 2,
      };
      const mid2 = {
        x: (existing.start.x + existing.end.x) / 2,
        y: (existing.start.y + existing.end.y) / 2,
      };
      
      const midDist = calculateDistance(mid1, mid2);
      
      // Check if angles are very similar and midpoints are close
      const angleDiff = Math.abs(segment.angle - existing.angle);
      const normalizedAngleDiff = angleDiff > 90 ? 180 - angleDiff : angleDiff;
      
      if (normalizedAngleDiff < 10 && midDist < Math.max(segment.length, existing.length) * 0.5) {
        // Check if the shorter segment is roughly along the same line
        const perpDist1 = pointToLineDistance(segment.start, existing.start, existing.end);
        const perpDist2 = pointToLineDistance(segment.end, existing.start, existing.end);
        
        if (perpDist1 < threshold && perpDist2 < threshold) {
          isDuplicate = true;
          break;
        }
      }
    }
    
    if (!isDuplicate) {
      result.push(segment);
    }
  }
  
  return result;
};

// Calculate perpendicular distance from point to line segment
const pointToLineDistance = (point: Point, lineStart: Point, lineEnd: Point): number => {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) return calculateDistance(point, lineStart);
  
  // Calculate perpendicular distance using cross product
  const dist = Math.abs((dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x)) / length;
  return dist;
};

export const detectJoints = async (
  imageDataUrl: string,
  scale: ScaleData,
  params: DetectionParameters
): Promise<Joint[]> => {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0);

          const src = cv.imread(canvas);
          const gray = new cv.Mat();
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

          const blurred = new cv.Mat();
          const ksize = new cv.Size(5, 5);
          cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

          const edges = new cv.Mat();
          cv.Canny(blurred, edges, params.cannyLow, params.cannyHigh, 3, false);

          const lines = new cv.Mat();
          cv.HoughLinesP(
            edges,
            lines,
            1,
            Math.PI / 180,
            params.houghThreshold,
            params.minLineLength,
            params.maxLineGap
          );

          // Convert detected lines to segments - use raw OpenCV output
          const rawSegments: LineSegment[] = [];
          for (let i = 0; i < lines.rows; i++) {
            const x1 = lines.data32S[i * 4];
            const y1 = lines.data32S[i * 4 + 1];
            const x2 = lines.data32S[i * 4 + 2];
            const y2 = lines.data32S[i * 4 + 3];

            const start: Point = { x: x1, y: y1 };
            const end: Point = { x: x2, y: y2 };
            const length = calculateDistance(start, end);
            const angle = getLineAngle(start, end);

            rawSegments.push({ start, end, angle, length });
          }

          // Clean up OpenCV objects
          src.delete();
          gray.delete();
          blurred.delete();
          edges.delete();
          lines.delete();

          // Only remove duplicates - no merging to preserve exact line positions
          const dedupedSegments = removeDuplicateLines(rawSegments, 20);

          // Convert to joints
          const joints: Joint[] = dedupedSegments.map((segment, i) => {
            const lengthMeters = segment.length / scale.pixelsPerMeter;
            const orientation = Math.atan2(
              segment.end.y - segment.start.y,
              segment.end.x - segment.start.x
            ) * (180 / Math.PI);

            return {
              id: `joint_${i}`,
              start: segment.start,
              end: segment.end,
              lengthPixels: segment.length,
              lengthMeters,
              orientation: (orientation + 360) % 360,
            };
          });

          // Filter by minimum length and sort by length
          const filteredJoints = joints.filter(j => j.lengthMeters >= 0.1);
          filteredJoints.sort((a, b) => b.lengthMeters - a.lengthMeters);

          resolve(filteredJoints);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = imageDataUrl;
    } catch (error) {
      reject(error);
    }
  });
};

export const calculateDistance = (p1: Point, p2: Point): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const calculateOrientation = (p1: Point, p2: Point): number => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (angle + 360) % 360;
};
