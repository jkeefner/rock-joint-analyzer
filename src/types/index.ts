/**
 * Point coordinate in image pixel space
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * GPS coordinates
 */
export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
}

/**
 * Face orientation data (azimuth and dip of rock face)
 */
export interface FaceOrientation {
  azimuth: number;   // 0-360 degrees from north
  dip: number;       // 0-90 degrees from horizontal
}

/**
 * Device orientation data at time of photo capture
 */
export interface DeviceOrientation {
  alpha: number | null;  // Z-axis rotation (0-360)
  beta: number | null;   // X-axis rotation (-180 to 180)
  gamma: number | null;  // Y-axis rotation (-90 to 90)
}

/**
 * Scale reference for converting pixels to real-world units
 */
export interface ScaleData {
  pixelsPerMeter: number;
  knownDistance?: number;  // in meters (legacy)
  realWorldDistance?: number;  // in meters (used by ScaleCalibration)
  point1?: Point;
  point2?: Point;
  calibrationPoints?: Point[];  // used by ScaleCalibration
}

// Alias for backward compatibility
export type ScaleReference = ScaleData;

/**
 * Detected or manually marked joint/fracture
 */
export interface Joint {
  id: string;
  start: Point;
  end: Point;
  lengthPixels: number;
  lengthMeters: number;
  orientation: number;  // degrees, 0-180 (bidirectional)
  type?: 'detected' | 'manual';
  confidence?: number;
}

/**
 * Calculated fracture statistics
 */
export interface FractureStats {
  jointCount: number;
  totalLength: number;      // meters
  meanLength: number;       // meters
  medianLength: number;     // meters
  minLength: number;        // meters
  maxLength: number;        // meters
  areaAnalyzed: number;     // square meters
  p21: number;              // fracture density (m/m²)
  frequency: number;        // joints per meter
}

/**
 * Joint detection parameters for OpenCV processing
 */
export interface DetectionParams {
  cannyLow: number;
  cannyHigh: number;
  houghThreshold: number;
  minLineLength: number;
  maxLineGap: number;
}

/**
 * Main project data structure containing all analysis information
 */
export interface ProjectData {
  // Photo data
  photo: string;           // base64 data URL
  photoWidth: number;
  photoHeight: number;
  
  // Metadata
  siteName?: string;
  cellNumber?: string;
  notes?: string;
  timestamp?: string;
  
  // Location data
  gpsCoordinates: GPSCoordinates | null;
  deviceOrientation?: DeviceOrientation;
  faceOrientation: FaceOrientation;
  
  // Scale reference
  scale: ScaleData | null;
  
  // Detection results
  joints: Joint[];
  detectionParams?: DetectionParams;
}

/**
 * User settings for persistent configuration
 */
export interface UserSettings {
  userName?: string;
  defaultSiteName?: string;
  projectName?: string;
  useImperial: boolean;  // true = imperial (ft), false = metric (m)
}

/**
 * App navigation state
 */
export type AppStep = 'capture' | 'scale' | 'detect' | 'edit' | 'results';
