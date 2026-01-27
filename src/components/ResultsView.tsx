import React, { useRef, useEffect } from 'react';
import { ProjectData, FractureStats } from '../types';
import { calculateFractureStats, exportToPDF, exportToCSV, exportToImage } from '../utils/exportUtils';
import './ResultsView.css';

interface ResultsViewProps {
  projectData: ProjectData;
  onStartNew: () => void;
  onBack: () => void;
}

const ResultsView: React.FC<ResultsViewProps> = ({ projectData, onStartNew, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageLoadedRef = useRef<boolean>(false);
  const [stats, setStats] = React.useState<FractureStats | null>(null);
  const [isExporting, setIsExporting] = React.useState<string | null>(null);

  useEffect(() => {
    if (projectData.scale) {
      const calculatedStats = calculateFractureStats(
        projectData.joints,
        projectData.scale,
        projectData.photoWidth,
        projectData.photoHeight
      );
      setStats(calculatedStats);
    }
  }, [projectData]);

  useEffect(() => {
    if (!imageLoadedRef.current) {
      loadImage();
    }
  }, [projectData.photo]);

  const loadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      imageLoadedRef.current = true;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      drawAnnotations(ctx, img.width, img.height);
    };
    img.src = projectData.photo;
  };

  const drawAnnotations = (ctx: CanvasRenderingContext2D, imgWidth: number, imgHeight: number) => {
    // Draw joints
    projectData.joints.forEach((joint, index) => {
      ctx.shadowColor = '#00ff00';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(joint.start.x, joint.start.y);
      ctx.lineTo(joint.end.x, joint.end.y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#00ff00';
      ctx.beginPath();
      ctx.arc(joint.start.x, joint.start.y, 5, 0, 2 * Math.PI);
      ctx.arc(joint.end.x, joint.end.y, 5, 0, 2 * Math.PI);
      ctx.fill();

      const midX = (joint.start.x + joint.end.x) / 2;
      const midY = (joint.start.y + joint.end.y) / 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(midX - 18, midY - 14, 36, 28);

      ctx.fillStyle = '#00ff00';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${index + 1}`, midX, midY);
    });

    // Draw scale bar
    if (projectData.scale) {
      const scaleY = 50;
      const scaleLength = Math.min(projectData.scale.pixelsPerMeter, imgWidth * 0.3);
      const scaleX = imgWidth - scaleLength - 50;
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
    ctx.fillText('Rock Joint Analyzer - Keefner Mining & Geotech LLC', 10, imgHeight - 10);
  };

  const formatCoordinate = (value: number, isLatitude: boolean): string => {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutesDecimal = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = ((minutesDecimal - minutes) * 60).toFixed(1);
    const direction = isLatitude 
      ? (value >= 0 ? 'N' : 'S')
      : (value >= 0 ? 'E' : 'W');
    return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
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

      <div className="results-layout">
        <div className="results-image">
          <h3>Annotated Image</h3>
          <div className="canvas-container">
            <canvas ref={canvasRef} />
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
              <div className="stat-value">{stats.meanTraceLength.toFixed(2)} m</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Min Trace Length</div>
              <div className="stat-value">{stats.minTraceLength.toFixed(2)} m</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Max Trace Length</div>
              <div className="stat-value">{stats.maxTraceLength.toFixed(2)} m</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Total Trace Length</div>
              <div className="stat-value">{stats.totalTraceLengthMeters.toFixed(2)} m</div>
            </div>

            <div className="stat-card highlight">
              <div className="stat-label">Fracture Density (P21)</div>
              <div className="stat-value">{stats.fractureDensityP21.toFixed(3)} m/m²</div>
              <div className="stat-note">Total trace length per unit area</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Image Area</div>
              <div className="stat-value">{stats.imageAreaM2.toFixed(2)} m²</div>
            </div>

            <div className="stat-card">
              <div className="stat-label">Fracture Frequency</div>
              <div className="stat-value">
                {(stats.totalJoints / Math.sqrt(stats.imageAreaM2)).toFixed(2)} joints/m
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

          {projectData.gpsCoordinates && (
            <div className="gps-info">
              <h4>📍 GPS Location</h4>
              <div className="gps-grid">
                <div>
                  <strong>Lat:</strong> {formatCoordinate(projectData.gpsCoordinates.latitude, true)}
                </div>
                <div>
                  <strong>Lon:</strong> {formatCoordinate(projectData.gpsCoordinates.longitude, false)}
                </div>
                {projectData.gpsCoordinates.altitude !== null && (
                  <div>
                    <strong>Elev:</strong> {projectData.gpsCoordinates.altitude.toFixed(1)} m
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="scale-info">
            <h4>Scale Information</h4>
            {projectData.scale && (
              <div>
                <p>
                  <strong>Scale:</strong> {projectData.scale.pixelsPerMeter.toFixed(2)} pixels/meter
                </p>
                <p>
                  <strong>Calibration Distance:</strong> {projectData.scale.realWorldDistance.toFixed(2)} m
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="joint-table-section">
        <h3>Individual Joint Data</h3>
        <div className="table-container">
          <table className="joint-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Length (m)</th>
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
                  <td>{joint.lengthMeters.toFixed(3)}</td>
                  <td>{joint.lengthPixels.toFixed(1)}</td>
                  <td>{joint.orientation?.toFixed(1) || 'N/A'}</td>
                  <td>({joint.start.x.toFixed(0)}, {joint.start.y.toFixed(0)})</td>
                  <td>({joint.end.x.toFixed(0)}, {joint.end.y.toFixed(0)})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            disabled={isExporting !== null}
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
