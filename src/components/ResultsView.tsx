import React, { useRef, useEffect, useState } from 'react';
import { ProjectData, FractureStats, Joint } from '../types';
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

// Colors for joint sets
const SET_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#16a085', '#c0392b',
  '#2980b9', '#27ae60'
];

// Unit conversion constants
const METERS_TO_FEET = 3.28084;
const SQ_METERS_TO_SQ_FEET = 10.7639;

// Cluster joints by orientation using k-means style clustering
const clusterJointsByOrientation = (joints: Joint[], maxSets: number = 12): JointSet[] => {
  if (joints.length === 0) return [];

  const normalizeOrientation = (angle: number): number => {
    let normalized = angle % 360;
    if (normalized < 0) normalized += 360;
    if (normalized >= 180) normalized -= 180;
    return normalized;
  };

  const orientations = joints.map(j => ({
    joint: j,
    orientation: normalizeOrientation(j.orientation || 0)
  }));

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

  let sets: JointSet[] = [];
  let setId = 1;

  bins.forEach((bin, binIndex) => {
    if (bin.joints.length > 0) {
      const meanOrientation = bin.orientations.reduce((a, b) => a + b, 0) / bin.orientations.length;
      const totalLength = bin.joints.reduce((sum, j) => sum + j.lengthMeters, 0);
      
      sets.push({
        id: setId++,
        meanOrientation: Math.round(meanOrientation),
        count: bin.joints.length,
        joints: bin.joints,
        totalLength,
        meanLength: totalLength / bin.joints.length,
        color: SET_COLORS[(setId - 2) % SET_COLORS.length]
      });
    }
  });

  sets.sort((a, b) => b.count - a.count);
  sets = sets.slice(0, maxSets);
  sets.forEach((set, index) => {
    set.id = index + 1;
    set.color = SET_COLORS[index % SET_COLORS.length];
  });

  return sets;
};

const ResultsView: React.FC<ResultsViewProps> = ({ projectData, onStartNew, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [stats, setStats] = useState<FractureStats | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [jointSets, setJointSets] = useState<JointSet[]>([]);
  const [showJointTable, setShowJointTable] = useState(false);
  const [useImperial, setUseImperial] = useState(true);

  // Unit conversion helpers
  const formatLength = (meters: number): string => {
    if (useImperial) {
      return `${(meters * METERS_TO_FEET).toFixed(2)} ft`;
    }
    return `${meters.toFixed(2)} m`;
  };

  const formatLengthShort = (meters: number): string => {
    if (useImperial) {
      return `${(meters * METERS_TO_FEET).toFixed(3)} ft`;
    }
    return `${meters.toFixed(3)} m`;
  };

  const formatArea = (sqMeters: number): string => {
    if (useImperial) {
      return `${(sqMeters * SQ_METERS_TO_SQ_FEET).toFixed(2)} ft²`;
    }
    return `${sqMeters.toFixed(2)} m²`;
  };

  const formatDensity = (density: number): string => {
    if (useImperial) {
      return `${(density * METERS_TO_FEET / SQ_METERS_TO_SQ_FEET).toFixed(4)} ft/ft²`;
    }
    return `${density.toFixed(4)} m/m²`;
  };

  const formatFrequency = (freq: number): string => {
    if (useImperial) {
      return `${(freq / METERS_TO_FEET).toFixed(2)} joints/ft`;
    }
    return `${freq.toFixed(2)} joints/m`;
  };

  const getLengthUnit = (): string => useImperial ? 'ft' : 'm';

  // Calculate stats on mount
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
    }
  }, [projectData]);

  // Load image once on mount - same pattern as JointDetection
  useEffect(() => {
    loadImage();
  }, [projectData.photo]);

  const loadImage = () => {
    console.log('ResultsView: Starting image load...');
    console.log('ResultsView: Photo data length:', projectData.photo?.length || 0);
    console.log('ResultsView: Photo starts with:', projectData.photo?.substring(0, 50));
    
    setImageLoaded(false);
    setImageError(null);
    
    const img = new Image();
    
    img.onload = () => {
      console.log('ResultsView: Image loaded successfully!', img.width, 'x', img.height);
      imageRef.current = img;
      setImageLoaded(true);
      drawCanvas();
    };
    
    img.onerror = (e) => {
      console.error('ResultsView: Image failed to load:', e);
      setImageError('Failed to load image');
      setImageLoaded(false);
    };
    
    // Set src after attaching handlers
    img.src = projectData.photo;
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    
    console.log('ResultsView: drawCanvas called, canvas:', !!canvas, 'img:', !!img);
    
    if (!canvas || !img) {
      console.log('ResultsView: Missing canvas or image, skipping draw');
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('ResultsView: Could not get canvas context');
      return;
    }

    console.log('ResultsView: Drawing to canvas, img size:', img.width, 'x', img.height);

    // Set canvas dimensions
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw the base image
    ctx.drawImage(img, 0, 0);

    // Draw joints
    projectData.joints.forEach((joint, index) => {
      // Draw line with glow effect
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(joint.start.x, joint.start.y);
      ctx.lineTo(joint.end.x, joint.end.y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw endpoints
      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(joint.start.x, joint.start.y, 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(joint.end.x, joint.end.y, 5, 0, 2 * Math.PI);
      ctx.fill();

      const midX = (joint.start.x + joint.end.x) / 2;
      const midY = (joint.start.y + joint.end.y) / 2;

      // Draw label background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(midX - 18, midY - 14, 36, 28);

      // Draw label text
      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${index + 1}`, midX, midY);
    });

    // Draw scale bar
    if (projectData.scale) {
      const scaleY = 50;
      const scaleLength = Math.min(projectData.scale.pixelsPerMeter, img.width * 0.3);
      const scaleX = img.width - scaleLength - 50;
      const scaleMeters = scaleLength / projectData.scale.pixelsPerMeter;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(scaleX - 20, scaleY - 50, scaleLength + 40, 80);

      ctx.strokeStyle = '#ff4444';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(scaleX, scaleY);
      ctx.lineTo(scaleX + scaleLength, scaleY);
      ctx.stroke();

      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(scaleX, scaleY - 15);
      ctx.lineTo(scaleX, scaleY + 15);
      ctx.moveTo(scaleX + scaleLength, scaleY - 15);
      ctx.lineTo(scaleX + scaleLength, scaleY + 15);
      ctx.stroke();

      ctx.fillStyle = 'white';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${scaleMeters.toFixed(1)} m`, scaleX + scaleLength / 2, scaleY - 25);
    }

    // Add watermark
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Rock Joint Analyzer - Keefner Mining & Geotech LLC', 10, img.height - 10);
    
    console.log('ResultsView: Canvas draw complete');
  };

  const handleExportPDF = async () => {
    if (!stats) return;
    setIsExporting('pdf');
    try {
      await exportToPDF(projectData, stats, canvasRef.current);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportCSV = async () => {
    if (!stats) return;
    setIsExporting('csv');
    try {
      await exportToCSV(projectData, stats);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportImage = async () => {
    if (!imageLoaded) {
      alert('Please wait for the image to load.');
      return;
    }
    setIsExporting('image');
    try {
      await exportToImage(canvasRef.current);
    } catch (error) {
      console.error('Error exporting image:', error);
      alert('Failed to export image. Please try again.');
    } finally {
      setIsExporting(null);
    }
  };

  if (!stats) {
    return (
      <div className="results-loading">
        <div className="spinner"></div>
        <p>Calculating statistics...</p>
      </div>
    );
  }

  return (
    <div className="results-view">
      <div className="results-header">
        <h2>📊 Analysis Results</h2>
        <p className="timestamp">Analysis completed: {new Date(projectData.timestamp).toLocaleString()}</p>
      </div>

      {/* Unit Toggle */}
      <div className="unit-toggle-container">
        <span className="unit-label">Units:</span>
        <div className="unit-toggle">
          <button 
            className={`unit-btn ${useImperial ? 'active' : ''}`}
            onClick={() => setUseImperial(true)}
          >
            Imperial (ft)
          </button>
          <button 
            className={`unit-btn ${!useImperial ? 'active' : ''}`}
            onClick={() => setUseImperial(false)}
          >
            Metric (m)
          </button>
        </div>
      </div>

      <div className="results-layout">
        <div className="results-image">
          <h3>Annotated Image</h3>
          <div className="canvas-container">
            {!imageLoaded && !imageError && (
              <div className="canvas-loading">
                <div className="spinner"></div>
                <p>Loading image...</p>
              </div>
            )}
            {imageError && (
              <div className="canvas-error">
                <p>⚠️ {imageError}</p>
                <button onClick={loadImage} className="btn-retry">
                  Retry Loading
                </button>
              </div>
            )}
            <canvas 
              ref={canvasRef} 
              style={{ display: imageLoaded ? 'block' : 'none' }} 
            />
          </div>
        </div>

        <div className="results-stats">
          <h3>Fracture Statistics</h3>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Joints</div>
              <div className="stat-value">{stats.totalJoints}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Mean Trace Length</div>
              <div className="stat-value">{formatLength(stats.meanTraceLength)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Min Trace Length</div>
              <div className="stat-value">{formatLength(stats.minTraceLength)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Max Trace Length</div>
              <div className="stat-value">{formatLength(stats.maxTraceLength)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Total Trace Length</div>
              <div className="stat-value">{formatLength(stats.totalTraceLengthMeters)}</div>
            </div>

            <div className="stat-card highlight">
              <div className="stat-label">Fracture Density (P21)</div>
              <div className="stat-value">{formatDensity(stats.fractureDensityP21)}</div>
              <div className="stat-note">Total trace length per unit area</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Image Area</div>
              <div className="stat-value">{formatArea(stats.imageAreaM2)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Fracture Frequency</div>
              <div className="stat-value">
                {formatFrequency(stats.totalJoints / Math.sqrt(stats.imageAreaM2))}
              </div>
              <div className="stat-note">Approximate linear frequency</div>
            </div>
          </div>

          <div className="orientation-info">
            <h4>Face Orientation</h4>
            <div className="orientation-grid">
              <div>
                <strong>Azimuth:</strong> {projectData.faceOrientation.azimuth}°
              </div>
              <div>
                <strong>Dip:</strong> {projectData.faceOrientation.dip}°
              </div>
            </div>
          </div>

          <div className="scale-info">
            <h4>Scale Information</h4>
            {projectData.scale && (
              <div>
                <p>
                  <strong>Scale:</strong> {projectData.scale.pixelsPerMeter.toFixed(2)} pixels/meter
                </p>
                <p>
                  <strong>Calibration Distance:</strong> {formatLength(projectData.scale.realWorldDistance)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Joint Set Clustering Section */}
      {jointSets.length > 0 && (
        <div className="joint-sets-section">
          <h3>🧭 Joint Set Orientation Clusters</h3>
          <p className="section-description">
            Joints grouped by apparent orientation (15° bins). Use these as a starting point for manual measurement of true joint set orientations.
          </p>
          
          <div className="joint-sets-layout">
            <div className="rose-diagram-container">
              <svg viewBox="0 0 300 300" className="rose-diagram">
                <circle cx="150" cy="150" r="140" fill="#f8f9fa" stroke="#ddd" strokeWidth="1" />
                
                {[35, 70, 105, 140].map((r, i) => (
                  <circle key={i} cx="150" cy="150" r={r} fill="none" stroke="#e0e0e0" strokeWidth="1" />
                ))}
                
                <line x1="150" y1="10" x2="150" y2="290" stroke="#ccc" strokeWidth="1" />
                <line x1="10" y1="150" x2="290" y2="150" stroke="#ccc" strokeWidth="1" />
                
                <text x="150" y="20" textAnchor="middle" fontSize="12" fill="#666">N (0°)</text>
                <text x="280" y="154" textAnchor="middle" fontSize="12" fill="#666">E (90°)</text>
                <text x="150" y="295" textAnchor="middle" fontSize="12" fill="#666">S (180°)</text>
                <text x="20" y="154" textAnchor="middle" fontSize="12" fill="#666">W (270°)</text>
                
                {jointSets.map((set, index) => {
                  const angleRad = (set.meanOrientation - 90) * (Math.PI / 180);
                  const oppositeRad = angleRad + Math.PI;
                  
                  const maxCount = Math.max(...jointSets.map(s => s.count));
                  const petalLength = (set.count / maxCount) * 100 + 30;
                  
                  const halfWidth = 7.5 * (Math.PI / 180);
                  
                  const cx = 150, cy = 150;
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
                
                <circle cx="150" cy="150" r="5" fill="#333" />
              </svg>
            </div>
            
            <div className="joint-sets-table">
              <table>
                <thead>
                  <tr>
                    <th>Set</th>
                    <th>Orientation</th>
                    <th>Count</th>
                    <th>% of Total</th>
                    <th>Mean Length</th>
                    <th>Total Length</th>
                  </tr>
                </thead>
                <tbody>
                  {jointSets.map((set) => (
                    <tr key={set.id}>
                      <td>
                        <span className="set-color-indicator" style={{ backgroundColor: set.color }}></span>
                        Set {set.id}
                      </td>
                      <td><strong>{set.meanOrientation}°</strong></td>
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
          
          <div className="clustering-note">
            <strong>Note:</strong> These are apparent orientations measured from the image plane. 
            True 3D orientations require correction for face orientation (Azimuth: {projectData.faceOrientation.azimuth}°, Dip: {projectData.faceOrientation.dip}°).
          </div>
        </div>
      )}

      {/* Collapsible Joint Table Section */}
      <div className="joint-table-section">
        <div 
          className="collapsible-header"
          onClick={() => setShowJointTable(!showJointTable)}
        >
          <h3>
            <span className={`collapse-icon ${showJointTable ? 'open' : ''}`}>▶</span>
            Individual Joint Data ({projectData.joints.length} joints)
          </h3>
          <span className="collapse-hint">{showJointTable ? 'Click to collapse' : 'Click to expand'}</span>
        </div>
        
        {showJointTable && (
          <div className="table-container">
            <table className="joint-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Length ({getLengthUnit()})</th>
                  <th>Length (pixels)</th>
                  <th>Orientation (°)</th>
                  <th>Start Point</th>
                  <th>End Point</th>
                </tr>
              </thead>
              <tbody>
                {projectData.joints.map((joint, index) => (
                  <tr key={joint.id}>
                    <td>{index + 1}</td>
                    <td>{formatLengthShort(joint.lengthMeters)}</td>
                    <td>{joint.lengthPixels.toFixed(1)}</td>
                    <td>{joint.orientation?.toFixed(1) || 'N/A'}</td>
                    <td>({joint.start.x.toFixed(0)}, {joint.start.y.toFixed(0)})</td>
                    <td>({joint.end.x.toFixed(0)}, {joint.end.y.toFixed(0)})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="export-section">
        <h3>Export Options</h3>
        <div className="export-buttons">
          <button 
            className="btn-export" 
            onClick={handleExportPDF}
            disabled={isExporting !== null}
          >
            {isExporting === 'pdf' ? '⏳ Exporting...' : '📄 Export PDF Report'}
          </button>
          <button 
            className="btn-export" 
            onClick={handleExportCSV}
            disabled={isExporting !== null}
          >
            {isExporting === 'csv' ? '⏳ Exporting...' : '📊 Export CSV Data'}
          </button>
          <button 
            className="btn-export" 
            onClick={handleExportImage}
            disabled={isExporting !== null || !imageLoaded}
          >
            {isExporting === 'image' ? '⏳ Exporting...' : '🖼️ Export Annotated Image'}
          </button>
        </div>
      </div>

      <div className="button-group">
        <button className="btn-secondary" onClick={onBack}>
          ← Back to Edit
        </button>
        <button className="btn-primary" onClick={onStartNew}>
          🔄 Start New Analysis
        </button>
      </div>
    </div>
  );
};

export default ResultsView;
