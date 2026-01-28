import React, { useRef, useEffect, useState } from 'react';
import { ProjectData, FractureStats, Joint, ScaleData } from '../types';
import { calculateFractureStats, exportToPDF, exportToCSV, exportToImage } from '../utils/exportUtils';
import './ResultsView.css';

interface ResultsViewProps {
  projectData: ProjectData;
  onStartNew: () => void;
  onBack: () => void;
}

interface JointSet {
  id: number;
  meanOrientation: number;
  count: number;
  joints: Joint[];
  totalLength: number;
  meanLength: number;
  color: string;
}

// Colors for joint sets - distinctive palette for clustering
const SET_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
  '#2980b9', '#27ae60'
];

// Unit conversion constants
const METERS_TO_FEET = 3.28084;
const SQ_METERS_TO_SQ_FEET = 10.7639;

/**
 * Cluster joints by orientation using 15-degree bins
 * Returns top N sets sorted by count
 */
const clusterJointsByOrientation = (joints: Joint[], maxSets: number = 12): JointSet[] => {
  if (joints.length === 0) return [];

  // Normalize orientation to 0-180 range (bidirectional, so 0° = 180°)
  const normalizeOrientation = (angle: number): number => {
    let normalized = angle % 360;
    if (normalized < 0) normalized += 360;
    if (normalized >= 180) normalized -= 180;
    return normalized;
  };

  // Map joints to their normalized orientations
  const orientations = joints.map(j => ({
    joint: j,
    orientation: normalizeOrientation(j.orientation || 0)
  }));

  // Create 15-degree bins
  const binSize = 15;
  const bins: Map<number, { joints: Joint[], orientations: number[] }> = new Map();

  orientations.forEach(({ joint, orientation }) => {
    const binIndex = Math.floor(orientation / binSize) * binSize;
    if (!bins.has(binIndex)) {
      bins.set(binIndex, { joints: [], orientations: [] });
    }
    bins.get(binIndex)!.joints.push(joint);
    bins.get(binIndex)!.orientations.push(orientation);
  });

  // Convert bins to JointSet array
  let sets: JointSet[] = [];
  let setId = 1;

  bins.forEach((bin, binIndex) => {
    if (bin.joints.length > 0) {
      const meanOrientation = bin.orientations.reduce((a, b) => a + b, 0) / bin.orientations.length;
      const totalLength = bin.joints.reduce((sum, j) => sum + (j.lengthMeters || 0), 0);
      
      sets.push({
        id: setId++,
        meanOrientation: Math.round(meanOrientation),
        count: bin.joints.length,
        joints: bin.joints,
        totalLength,
        meanLength: bin.joints.length > 0 ? totalLength / bin.joints.length : 0,
        color: SET_COLORS[(setId - 2) % SET_COLORS.length]
      });
    }
  });

  // Sort by count (most joints first) and take top N
  sets.sort((a, b) => b.count - a.count);
  sets = sets.slice(0, maxSets);
  
  // Re-assign colors and IDs after sorting
  sets.forEach((set, index) => {
    set.id = index + 1;
    set.color = SET_COLORS[index % SET_COLORS.length];
  });

  return sets;
};

/**
 * Create mapping from joint ID to cluster color
 */
const createJointColorMap = (jointSets: JointSet[]): Map<string, string> => {
  const colorMap = new Map<string, string>();
  jointSets.forEach(set => {
    set.joints.forEach(joint => {
      colorMap.set(joint.id, set.color);
    });
  });
  return colorMap;
};

const ResultsView: React.FC<ResultsViewProps> = ({ projectData, onStartNew, onBack }) => {
  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  
  // State
  const [stats, setStats] = useState<FractureStats | null>(null);
  const [jointSets, setJointSets] = useState<JointSet[]>([]);
  const [jointColorMap, setJointColorMap] = useState<Map<string, string>>(new Map());
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [useImperial, setUseImperial] = useState<boolean>(true);
  const [jointDataExpanded, setJointDataExpanded] = useState<boolean>(false);

  // Unit formatting functions
  const formatLength = (m: number): string => 
    useImperial ? `${(m * METERS_TO_FEET).toFixed(3)} ft` : `${m.toFixed(3)} m`;
  
  const formatArea = (m2: number): string => 
    useImperial ? `${(m2 * SQ_METERS_TO_SQ_FEET).toFixed(2)} ft²` : `${m2.toFixed(2)} m²`;
  
  const formatDensity = (d: number): string => 
    useImperial ? `${(d / METERS_TO_FEET * SQ_METERS_TO_SQ_FEET).toFixed(4)} ft/ft²` : `${d.toFixed(4)} m/m²`;
  
  const formatFrequency = (f: number): string => 
    useImperial ? `${(f / METERS_TO_FEET).toFixed(2)} joints/ft` : `${f.toFixed(2)} joints/m`;
  
  const getLengthUnit = (): string => useImperial ? 'ft' : 'm';

  // Calculate stats and clusters when project data changes
  useEffect(() => {
    if (projectData.scale) {
      const calculatedStats = calculateFractureStats(
        projectData.joints,
        projectData.scale,
        projectData.photoWidth,
        projectData.photoHeight
      );
      setStats(calculatedStats);
      
      const clusters = clusterJointsByOrientation(projectData.joints, 12);
      setJointSets(clusters);
      setJointColorMap(createJointColorMap(clusters));
    }
  }, [projectData]);

  // Load image when photo changes
  useEffect(() => {
    loadImage();
  }, [projectData.photo]);

  // Draw canvas when image loads and color map is ready
  useEffect(() => {
    if (imageLoaded && jointColorMap.size >= 0) {
      drawCanvas();
    }
  }, [imageLoaded, jointColorMap, useImperial]);

  /**
   * Load the photo into an Image element stored in ref
   */
  const loadImage = () => {
    setImageLoaded(false);
    setImageError(null);
    
    console.log('ResultsView: Starting image load...');
    console.log('ResultsView: Photo data length:', projectData.photo?.length || 0);
    console.log('ResultsView: Photo starts with:', projectData.photo?.substring(0, 50));
    
    const img = new Image();
    
    img.onload = () => {
      console.log('ResultsView: Image loaded successfully', img.width, 'x', img.height);
      imageRef.current = img;
      setImageLoaded(true);
    };
    
    img.onerror = (e) => {
      console.error('ResultsView: Image failed to load:', e);
      setImageError('Failed to load image. Please try again.');
      setImageLoaded(false);
    };
    
    // Set source - this triggers the load
    img.src = projectData.photo;
  };

  /**
   * Draw the annotated image on canvas with joints colored by cluster
   */
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    
    if (!canvas || !img) {
      console.log('ResultsView: Cannot draw - canvas or image missing');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('ResultsView: Cannot get 2d context');
      return;
    }

    console.log('ResultsView: Drawing canvas', img.width, 'x', img.height);

    // Set canvas size to match image
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw the base image
    ctx.drawImage(img, 0, 0);

    // Draw joints with cluster colors
    projectData.joints.forEach((joint, index) => {
      const color = jointColorMap.get(joint.id) || '#00ff00';
      
      // Joint line with glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = 5;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(joint.start.x, joint.start.y);
      ctx.lineTo(joint.end.x, joint.end.y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Endpoint circles
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(joint.start.x, joint.start.y, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(joint.end.x, joint.end.y, 5, 0, 2 * Math.PI);
      ctx.fill();

      // Joint number label at midpoint
      const midX = (joint.start.x + joint.end.x) / 2;
      const midY = (joint.start.y + joint.end.y) / 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(midX - 18, midY - 14, 36, 28);
      ctx.fillStyle = color;
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${index + 1}`, midX, midY);
    });

    // Draw scale bar if scale is set
    if (projectData.scale) {
      const scaleY = 50;
      const scaleLength = Math.min(projectData.scale.pixelsPerMeter, img.width * 0.3);
      const scaleX = img.width - scaleLength - 50;
      const scaleMeters = scaleLength / projectData.scale.pixelsPerMeter;
      
      // Scale bar background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(scaleX - 20, scaleY - 50, scaleLength + 40, 80);
      
      // Scale bar line
      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(scaleX, scaleY);
      ctx.lineTo(scaleX + scaleLength, scaleY);
      ctx.stroke();
      
      // End caps
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(scaleX, scaleY - 15);
      ctx.lineTo(scaleX, scaleY + 15);
      ctx.moveTo(scaleX + scaleLength, scaleY - 15);
      ctx.lineTo(scaleX + scaleLength, scaleY + 15);
      ctx.stroke();
      
      // Scale text
      ctx.fillStyle = 'white';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      const scaleText = useImperial 
        ? `${(scaleMeters * METERS_TO_FEET).toFixed(2)} ft`
        : `${scaleMeters.toFixed(2)} m`;
      ctx.fillText(scaleText, scaleX + scaleLength / 2, scaleY - 25);
    }

    console.log('ResultsView: Canvas draw complete');
  };

  /**
   * Retry loading the image
   */
  const handleRetryImage = () => {
    loadImage();
  };

  /**
   * Export handlers
   */
  const handleExportPDF = async () => {
    if (!stats) return;
    setIsExporting('pdf');
    try {
      const canvas = canvasRef.current;
      await exportToPDF(projectData, stats, jointSets, canvas, useImperial);
    } catch (error) {
      console.error('PDF export failed:', error);
      alert('Failed to export PDF. Please try again.');
    }
    setIsExporting(null);
  };

  const handleExportCSV = async () => {
    if (!stats) return;
    setIsExporting('csv');
    try {
      await exportToCSV(projectData, stats, jointSets, useImperial);
    } catch (error) {
      console.error('CSV export failed:', error);
      alert('Failed to export CSV. Please try again.');
    }
    setIsExporting(null);
  };

  const handleExportImage = async () => {
    setIsExporting('image');
    try {
      const canvas = canvasRef.current;
      if (canvas) {
        await exportToImage(canvas, projectData.siteName || 'analysis');
      }
    } catch (error) {
      console.error('Image export failed:', error);
      alert('Failed to export image. Please try again.');
    }
    setIsExporting(null);
  };

  return (
    <div className="results-view">
      {/* Header with navigation */}
      <div className="results-header">
        <button className="back-button" onClick={onBack}>
          ← Back to Detection
        </button>
        <h2>Analysis Results</h2>
        <div className="header-spacer"></div>
      </div>

      {/* Units Toggle */}
      <div className="units-toggle">
        <label className="toggle-label">
          <span className={!useImperial ? 'active' : ''}>Metric</span>
          <input
            type="checkbox"
            checked={useImperial}
            onChange={(e) => setUseImperial(e.target.checked)}
          />
          <span className="toggle-slider"></span>
          <span className={useImperial ? 'active' : ''}>Imperial</span>
        </label>
      </div>

      {/* Site Info */}
      {projectData.siteName && (
        <div className="site-info">
          <h3>{projectData.siteName}</h3>
          {projectData.timestamp && (
            <p className="timestamp">{new Date(projectData.timestamp).toLocaleString()}</p>
          )}
        </div>
      )}

      {/* Annotated Image Canvas */}
      <div className="annotated-image-section">
        <h3>Annotated Image</h3>
        <div className="canvas-container">
          {!imageLoaded && !imageError && (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <p>Loading image...</p>
            </div>
          )}
          {imageError && (
            <div className="error-overlay">
              <p className="error-message">{imageError}</p>
              <button onClick={handleRetryImage} className="retry-button">
                Retry Loading
              </button>
            </div>
          )}
          <canvas 
            ref={canvasRef} 
            className={`result-canvas ${imageLoaded ? 'visible' : 'hidden'}`}
          />
        </div>
      </div>

      {/* Statistics Summary */}
      {stats && (
        <div className="stats-section">
          <h3>Fracture Statistics</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-value">{projectData.joints.length}</span>
              <span className="stat-label">Total Joints</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{formatLength(stats.totalLength)}</span>
              <span className="stat-label">Total Length</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{formatLength(stats.meanLength)}</span>
              <span className="stat-label">Mean Length</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{formatArea(stats.areaAnalyzed)}</span>
              <span className="stat-label">Area Analyzed</span>
            </div>
            <div className="stat-card highlight">
              <span className="stat-value">{formatDensity(stats.p21)}</span>
              <span className="stat-label">P21 Density</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{formatFrequency(stats.frequency)}</span>
              <span className="stat-label">Frequency</span>
            </div>
          </div>
        </div>
      )}

      {/* Joint Set Orientation Analysis - ROSETTE DIAGRAM */}
      {jointSets.length > 0 && (
        <div className="joint-sets-section">
          <h3>Joint Set Orientation Clustering</h3>
          <p className="section-note">
            Joints grouped into 15° orientation bins. Colors match annotated image.
            These are apparent orientations in the photo plane - field verification recommended.
          </p>
          
          <div className="joint-sets-layout">
            {/* Rose Diagram */}
            <div className="rose-diagram-container">
              <svg viewBox="0 0 300 300" className="rose-diagram">
                {/* Background circle */}
                <circle cx="150" cy="150" r="140" fill="#f8f9fa" stroke="#ddd" strokeWidth="1" />
                
                {/* Concentric circles for scale */}
                {[35, 70, 105, 140].map((r, i) => (
                  <circle key={i} cx="150" cy="150" r={r} fill="none" stroke="#e0e0e0" strokeWidth="1" />
                ))}
                
                {/* Cardinal direction lines */}
                <line x1="150" y1="10" x2="150" y2="290" stroke="#ccc" strokeWidth="1" />
                <line x1="10" y1="150" x2="290" y2="150" stroke="#ccc" strokeWidth="1" />
                
                {/* Direction labels */}
                <text x="150" y="20" textAnchor="middle" fontSize="12" fill="#666">N (0°)</text>
                <text x="280" y="154" textAnchor="middle" fontSize="12" fill="#666">E (90°)</text>
                <text x="150" y="295" textAnchor="middle" fontSize="12" fill="#666">S (180°)</text>
                <text x="20" y="154" textAnchor="middle" fontSize="12" fill="#666">W (270°)</text>
                
                {/* Rose petals for each joint set */}
                {jointSets.map((set, index) => {
                  // Convert orientation to radians (0° = North = up)
                  const angleRad = (set.meanOrientation - 90) * (Math.PI / 180);
                  const oppositeRad = angleRad + Math.PI;
                  
                  // Scale petal length by count
                  const maxCount = Math.max(...jointSets.map(s => s.count));
                  const petalLength = (set.count / maxCount) * 100 + 30;
                  
                  // Petal half-width in radians (7.5° = half of 15° bin)
                  const halfWidth = 7.5 * (Math.PI / 180);
                  
                  const cx = 150, cy = 150;
                  
                  // Create bidirectional petal (both directions since joints are bidirectional)
                  const points = [
                    `${cx + Math.cos(angleRad - halfWidth) * 20},${cy + Math.sin(angleRad - halfWidth) * 20}`,
                    `${cx + Math.cos(angleRad) * petalLength},${cy + Math.sin(angleRad) * petalLength}`,
                    `${cx + Math.cos(angleRad + halfWidth) * 20},${cy + Math.sin(angleRad + halfWidth) * 20}`,
                    `${cx + Math.cos(oppositeRad - halfWidth) * 20},${cy + Math.sin(oppositeRad - halfWidth) * 20}`,
                    `${cx + Math.cos(oppositeRad) * petalLength},${cy + Math.sin(oppositeRad) * petalLength}`,
                    `${cx + Math.cos(oppositeRad + halfWidth) * 20},${cy + Math.sin(oppositeRad + halfWidth) * 20}`,
                  ].join(' ');
                  
                  return (
                    <g key={index}>
                      <polygon
                        points={points}
                        fill={set.color}
                        fillOpacity="0.6"
                        stroke={set.color}
                        strokeWidth="2"
                      />
                    </g>
                  );
                })}
                
                {/* Center circle */}
                <circle cx="150" cy="150" r="15" fill="white" stroke="#666" strokeWidth="1" />
              </svg>
            </div>

            {/* Joint Sets Table */}
            <div className="joint-sets-table-container">
              <table className="joint-sets-table">
                <thead>
                  <tr>
                    <th>Set</th>
                    <th>Orientation</th>
                    <th>Count</th>
                    <th>%</th>
                    <th>Mean Length</th>
                    <th>Total Length</th>
                  </tr>
                </thead>
                <tbody>
                  {jointSets.map((set) => (
                    <tr key={set.id}>
                      <td>
                        <span 
                          className="set-color-indicator" 
                          style={{ backgroundColor: set.color }}
                        ></span>
                        {set.id}
                      </td>
                      <td>{set.meanOrientation}°</td>
                      <td>{set.count}</td>
                      <td>{((set.count / projectData.joints.length) * 100).toFixed(1)}%</td>
                      <td>{formatLength(set.meanLength)}</td>
                      <td>{formatLength(set.totalLength)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Individual Joint Data - Collapsible */}
      <div className="joint-data-section">
        <button 
          type="button"
          className="joint-data-header"
          onClick={() => setJointDataExpanded(prev => !prev)}
        >
          <h3>Individual Joint Data ({projectData.joints.length})</h3>
          <span className={`expand-arrow ${jointDataExpanded ? 'expanded' : ''}`}>
            {jointDataExpanded ? '▼' : '▶'}
          </span>
        </button>
        
        {jointDataExpanded && (
          <div className="joint-data-content">
            <table className="joint-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Length</th>
                  <th>Orientation</th>
                  <th>Start (px)</th>
                  <th>End (px)</th>
                </tr>
              </thead>
              <tbody>
                {projectData.joints.map((joint, index) => (
                  <tr key={joint.id}>
                    <td>
                      <span 
                        className="joint-color-dot"
                        style={{ backgroundColor: jointColorMap.get(joint.id) || '#00ff00' }}
                      ></span>
                      {index + 1}
                    </td>
                    <td>{formatLength(joint.lengthMeters || 0)}</td>
                    <td>{joint.orientation?.toFixed(1) || 0}°</td>
                    <td>({Math.round(joint.start.x)}, {Math.round(joint.start.y)})</td>
                    <td>({Math.round(joint.end.x)}, {Math.round(joint.end.y)})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Buttons */}
      <div className="export-section">
        <h3>Export Results</h3>
        <div className="export-buttons">
          <button 
            className="export-button pdf"
            onClick={handleExportPDF}
            disabled={isExporting !== null || !stats}
          >
            {isExporting === 'pdf' ? 'Exporting...' : '📄 Export PDF Report'}
          </button>
          <button 
            className="export-button csv"
            onClick={handleExportCSV}
            disabled={isExporting !== null || !stats}
          >
            {isExporting === 'csv' ? 'Exporting...' : '📊 Export CSV Data'}
          </button>
          <button 
            className="export-button image"
            onClick={handleExportImage}
            disabled={isExporting !== null || !imageLoaded}
          >
            {isExporting === 'image' ? 'Exporting...' : '🖼️ Export Annotated Image'}
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button className="secondary-button" onClick={onBack}>
          ← Adjust Detection
        </button>
        <button className="primary-button" onClick={onStartNew}>
          Start New Analysis
        </button>
      </div>
    </div>
  );
};

export default ResultsView;
