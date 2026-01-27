import React, { useState, useRef, useEffect } from 'react';
import { ScaleData, Joint } from '../types';
import { detectJoints } from '../utils/imageProcessing';
import './JointDetection.css';

interface JointDetectionProps {
  photo: string;
  scale: ScaleData;
  onDetected: (joints: Joint[]) => void;
  onBack: () => void;
}

const JointDetection: React.FC<JointDetectionProps> = ({
  photo,
  scale,
  onDetected,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedJoints, setDetectedJoints] = useState<Joint[]>([]);
  const [showOriginal, setShowOriginal] = useState(true);
  const [selectionMode, setSelectionMode] = useState(false);
  const [hoveredJointId, setHoveredJointId] = useState<string | null>(null);
  // More conservative default parameters to reduce false detections
  const [parameters, setParameters] = useState({
    cannyLow: 70,
    cannyHigh: 200,
    houghThreshold: 100,
    minLineLength: 80,
    maxLineGap: 10,
  });

  const imageRef = useRef<HTMLImageElement | null>(null);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    loadImage();
  }, [photo]);

  const loadImage = () => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      drawCanvas();
    };
    img.src = photo;
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0);

    if (!showOriginal && detectedJoints.length > 0) {
      detectedJoints.forEach((joint, index) => {
        const isHovered = joint.id === hoveredJointId;
        
        ctx.strokeStyle = isHovered ? '#ff6b6b' : '#00ff00';
        ctx.lineWidth = isHovered ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(joint.start.x, joint.start.y);
        ctx.lineTo(joint.end.x, joint.end.y);
        ctx.stroke();

        const midX = (joint.start.x + joint.end.x) / 2;
        const midY = (joint.start.y + joint.end.y) / 2;

        // Draw label background
        ctx.fillStyle = isHovered ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(midX - 18, midY - 12, 36, 24);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${index + 1}`, midX, midY);

        // Draw delete indicator when in selection mode and hovered
        if (selectionMode && isHovered) {
          ctx.fillStyle = '#ff6b6b';
          ctx.beginPath();
          ctx.arc(joint.start.x, joint.start.y, 10, 0, 2 * Math.PI);
          ctx.arc(joint.end.x, joint.end.y, 10, 0, 2 * Math.PI);
          ctx.fill();
          
          // Draw X marks
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 2;
          [joint.start, joint.end].forEach(point => {
            ctx.beginPath();
            ctx.moveTo(point.x - 5, point.y - 5);
            ctx.lineTo(point.x + 5, point.y + 5);
            ctx.moveTo(point.x + 5, point.y - 5);
            ctx.lineTo(point.x - 5, point.y + 5);
            ctx.stroke();
          });
        }
      });
    }
  };

  useEffect(() => {
    drawCanvas();
  }, [showOriginal, detectedJoints, hoveredJointId, selectionMode]);

  const handleDetect = async () => {
    setIsProcessing(true);

    try {
      const joints = await detectJoints(photo, scale, parameters);
      setDetectedJoints(joints);
      setShowOriginal(false);
    } catch (error) {
      console.error('Error detecting joints:', error);
      alert('Failed to detect joints. Please try adjusting parameters.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const findJointAtPoint = (point: { x: number; y: number }, threshold: number = 15): string | null => {
    for (const joint of detectedJoints) {
      const distToLine = pointToLineDistance(point, joint.start, joint.end);
      if (distToLine < threshold) {
        return joint.id;
      }
    }
    return null;
  };

  const pointToLineDistance = (
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number }
  ): number => {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectionMode || showOriginal || detectedJoints.length === 0) {
      setHoveredJointId(null);
      return;
    }

    const point = getCanvasPoint(e);
    const jointId = findJointAtPoint(point);
    setHoveredJointId(jointId);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectionMode || showOriginal || detectedJoints.length === 0) return;

    const point = getCanvasPoint(e);
    const jointId = findJointAtPoint(point);

    if (jointId) {
      setDetectedJoints(detectedJoints.filter(j => j.id !== jointId));
      setHoveredJointId(null);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all detected joints?')) {
      setDetectedJoints([]);
      setShowOriginal(true);
    }
  };

  const handleContinue = () => {
    if (detectedJoints.length === 0) {
      const proceed = window.confirm(
        'No joints detected. Continue to manual editing anyway?'
      );
      if (!proceed) return;
    }
    onDetected(detectedJoints);
  };

  const getCursorStyle = (): string => {
    if (selectionMode && !showOriginal && detectedJoints.length > 0) {
      return hoveredJointId ? 'pointer' : 'crosshair';
    }
    return 'default';
  };

  return (
    <div className="joint-detection" ref={containerRef}>
      <div className="instructions">
        <h2>Step 3: Automatic Joint Detection</h2>
        <p>
          Adjust parameters and click "Detect Joints" to automatically identify linear features.
          Use the selection tool to remove unwanted detections.
        </p>
      </div>

      <div className="detection-layout">
        <div className="parameters-panel">
          <h3>Detection Parameters</h3>

          <div className="parameter-group">
            <label>
              Canny Low Threshold: {parameters.cannyLow}
              <input
                type="range"
                min="10"
                max="100"
                value={parameters.cannyLow}
                onChange={(e) => setParameters({
                  ...parameters,
                  cannyLow: parseInt(e.target.value)
                })}
              />
            </label>
            <small>Lower values detect more edges (more sensitive)</small>
          </div>

          <div className="parameter-group">
            <label>
              Canny High Threshold: {parameters.cannyHigh}
              <input
                type="range"
                min="50"
                max="300"
                value={parameters.cannyHigh}
                onChange={(e) => setParameters({
                  ...parameters,
                  cannyHigh: parseInt(e.target.value)
                })}
              />
            </label>
            <small>Higher values require stronger edges</small>
          </div>

          <div className="parameter-group">
            <label>
              Hough Threshold: {parameters.houghThreshold}
              <input
                type="range"
                min="30"
                max="150"
                value={parameters.houghThreshold}
                onChange={(e) => setParameters({
                  ...parameters,
                  houghThreshold: parseInt(e.target.value)
                })}
              />
            </label>
            <small>Minimum votes for a line to be detected</small>
          </div>

          <div className="parameter-group">
            <label>
              Min Line Length (pixels): {parameters.minLineLength}
              <input
                type="range"
                min="20"
                max="200"
                value={parameters.minLineLength}
                onChange={(e) => setParameters({
                  ...parameters,
                  minLineLength: parseInt(e.target.value)
                })}
              />
            </label>
            <small>Ignore lines shorter than this</small>
          </div>

          <div className="parameter-group">
            <label>
              Max Line Gap (pixels): {parameters.maxLineGap}
              <input
                type="range"
                min="5"
                max="100"
                value={parameters.maxLineGap}
                onChange={(e) => setParameters({
                  ...parameters,
                  maxLineGap: parseInt(e.target.value)
                })}
              />
            </label>
            <small>Maximum gap between line segments to connect</small>
          </div>

          <button
            className="btn-primary btn-detect"
            onClick={handleDetect}
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : '🔍 Detect Joints'}
          </button>

          <div className="preset-buttons">
            <button
              className="btn-preset"
              onClick={() => setParameters({
                cannyLow: 40,
                cannyHigh: 120,
                houghThreshold: 60,
                minLineLength: 50,
                maxLineGap: 15,
              })}
            >
              Sensitive (more joints)
            </button>
            <button
              className="btn-preset"
              onClick={() => setParameters({
                cannyLow: 70,
                cannyHigh: 200,
                houghThreshold: 100,
                minLineLength: 80,
                maxLineGap: 10,
              })}
            >
              Balanced (default)
            </button>
            <button
              className="btn-preset"
              onClick={() => setParameters({
                cannyLow: 100,
                cannyHigh: 250,
                houghThreshold: 130,
                minLineLength: 100,
                maxLineGap: 5,
              })}
            >
              Conservative (fewer joints)
            </button>
          </div>

          {detectedJoints.length > 0 && (
            <div className="detection-stats">
              <h4>Detection Results</h4>
              <p><strong>Joints detected:</strong> {detectedJoints.length}</p>
              <p>
                <strong>Avg length:</strong>{' '}
                {(detectedJoints.reduce((sum, j) => sum + j.lengthMeters, 0) /
                  detectedJoints.length).toFixed(2)} m
              </p>
            </div>
          )}
        </div>

        <div className="canvas-panel">
          <div className="view-controls">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showOriginal}
                onChange={(e) => setShowOriginal(e.target.checked)}
                disabled={detectedJoints.length === 0}
              />
              Show original image
            </label>

            {detectedJoints.length > 0 && !showOriginal && (
              <>
                <div className="control-divider"></div>
                <label className={`checkbox-label selection-mode ${selectionMode ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectionMode}
                    onChange={(e) => setSelectionMode(e.target.checked)}
                  />
                  🗑️ Click to remove joints
                </label>
                <button 
                  className="btn-clear-all"
                  onClick={handleClearAll}
                >
                  Clear All
                </button>
              </>
            )}
          </div>

          {selectionMode && !showOriginal && detectedJoints.length > 0 && (
            <div className="selection-hint">
              <span>👆 Click on any green line to remove it</span>
            </div>
          )}

          <div className="canvas-container">
            <canvas 
              ref={canvasRef}
              onMouseMove={handleCanvasMouseMove}
              onClick={handleCanvasClick}
              onMouseLeave={() => setHoveredJointId(null)}
              style={{ cursor: getCursorStyle() }}
            />
          </div>

          {detectedJoints.length > 0 && !showOriginal && (
            <div className="overlay-legend">
              <span className="legend-item">
                <span className="legend-color" style={{ background: '#00ff00' }}></span>
                Detected joints (green)
              </span>
              {selectionMode && (
                <span className="legend-item">
                  <span className="legend-color" style={{ background: '#ff6b6b' }}></span>
                  Hover to delete (red)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="button-group">
        <button className="btn-secondary" onClick={onBack}>
          ← Back to Scale
        </button>
        <button
          className="btn-primary"
          onClick={handleContinue}
        >
          Continue to Manual Editing →
        </button>
      </div>
    </div>
  );
};

export default JointDetection;
