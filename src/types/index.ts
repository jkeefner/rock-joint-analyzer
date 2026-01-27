export interface Point {
  x: number;
  y: number;
}

export interface FaceOrientation {
  azimuth: number; // 0-360 degrees
  dip: number; // 0-90 degrees (90 = vertical face)
}

export interface ScaleData {
  pixelsPerMeter: number;
  calibrationPoints: [Point, Point];
  realWorldDistance: number; // meters
}

export interface Joint {
  id: string;
  start: Point;
  end: Point;
  lengthMeters: number;
  lengthPixels: number;
  orientation?: number; // azimuth of trace
}

export interface ProjectData {
  photo: string;
  photoWidth: number;
  photoHeight: number;
  faceOrientation: FaceOrientation;
  scale: ScaleData | null;
  joints: Joint[];
  timestamp: string;
}

export interface FractureStats {
  totalJoints: number;
  meanTraceLength: number;
  minTraceLength: number;
  maxTraceLength: number;
  totalTraceLengthMeters: number;
  imageAreaM2: number;
  fractureDensityP21: number; // m/m²
  traceLengthDistribution: number[];
}