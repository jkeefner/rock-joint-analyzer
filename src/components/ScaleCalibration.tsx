import React, { useRef, useState, useEffect } from 'react';
import { ScaleData, Point } from '../types';
import './ScaleCalibration.css';

interface ScaleCalibrationProps {
  photo: string;
  onScaleSet: (scale: ScaleData) => void;
  onBack: () => void;
}

const ScaleCalibration: React.FC<ScaleCalibrationProps> = ({ photo, onScaleSet, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [realDistance, setRealDistance] = useState<string>('1.0');
  const [displayScale, setDisplayScale] = useState<number>(1);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      
      const containerWidth = container.clientWidth - 20;
      const containerHeight = window.innerHeight * 0.5;
      const scaleX = containerWidth / img.width;
      const scaleY = containerHeight / img.height;
      const scale = Math.min(scaleX, scaleY, 1);
      
      setDisplayScale(scale);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
    };
    img.src = photo;
  }, [photo]);

  useEffect(() => {
    drawCanvas();
  }, [points]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw points
      points.forEach((point, index) => {
        const x = point.x * displayScale;
        const y = point.y * displayScale;
        
        // Outer glow
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 68, 68, 0.3)';
        ctx.fill();
        
        // Inner circle
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff4444';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${index + 1}`, x, y);
      });

      // Draw line between points
      if (points.length === 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x * displayScale, points[0].y * displayScale);
        ctx.lineTo(points[1].x * displayScale, points[1].y * displayScale);
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Show pixel distance
        const pixelDist = Math.sqrt(
          Math.pow(points[1].x - points[0].x, 2) + 
          Math.pow(points[1].y - points[0].y, 2)
        );
        const midX = (points[0].x + points[1].x) / 2 * displayScale;
        const midY = (points[0].y + points[1].y) / 2 * displayScale;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(midX - 50, midY - 30, 100, 25);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${pixelDist.toFixed(0)} px`, midX, midY - 17);
      }
    };
    img.src = photo;
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / displayScale;
    const y = (e.clientY - rect.top) / displayScale;

    if (points.length < 2) {
      setPoints([...points, { x, y }]);
    } else {
      setPoints([{ x, y }]);
    }
  };

  const handleConfirm = () => {
    if (points.length !== 2) return;

    const pixelDistance = Math.sqrt(
      Math.pow(points[1].x - points[0].x, 2) + 
      Math.pow(points[1].y - points[0].y, 2)
    );

    const realDistanceNum = parseFloat(realDistance);
    if (isNaN(realDistanceNum) || realDistanceNum <= 0) {
      alert('Please enter a valid distance');
      return;
    }

    const pixelsPerMeter = pixelDistance / realDistanceNum;

    onScaleSet({
      pixelsPerMeter,
      calibrationPoints: [points[0], points[1]],
      realWorldDistance: realDistanceNum,
    });
  };

  const handleReset = () => {
    setPoints([]);
  };

  const pixelDistance = points.length === 2 
    ? Math.sqrt(
        Math.pow(points[1].x - points[0].x, 2) + 
        Math.pow(points[1].y - points[0].y, 2)
      )
    : 0;

  return (
    <div className="scale-calibration">
      <div className="calibration-header">
        <h2>📏 Scale Calibration</h2>
        <p className="instructions">
          Tap two points on a known distance (e.g., scale bar, measuring tape, or object of known size).
        </p>
      </div>

      <div className="canvas-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ cursor: 'crosshair' }}
        />
      </div>

      <div className="calibration-controls">
        <div className="point-status">
          <span className={points.length >= 1 ? 'active' : ''}>Point 1: {points.length >= 1 ? '✓' : '○'}</span>
          <span className={points.length >= 2 ? 'active' : ''}>Point 2: {points.length >= 2 ? '✓' : '○'}</span>
        </div>

        {points.length === 2 && (
          <div className="distance-info">
            <p>Pixel distance: <strong>{pixelDistance.toFixed(1)} px</strong></p>
          </div>
        )}

        <div className="distance-input">
          <label>
            <span>Real-world distance (meters):</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={realDistance}
              onChange={(e) => setRealDistance(e.target.value)}
              placeholder="Enter distance in meters"
            />
          </label>
        </div>

        {points.length === 2 && parseFloat(realDistance) > 0 && (
          <div className="scale-preview">
            <p>
              Scale: <strong>{(pixelDistance / parseFloat(realDistance)).toFixed(1)} pixels/meter</strong>
            </p>
          </div>
        )}
      </div>

      <div className="button-group">
        <button className="btn-secondary" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-secondary" onClick={handleReset} disabled={points.length === 0}>
          Reset Points
        </button>
        <button 
          className="btn-primary" 
          onClick={handleConfirm}
          disabled={points.length !== 2 || parseFloat(realDistance) <= 0}
        >
          Confirm Scale →
        </button>
      </div>
    </div>
  );
};

export default ScaleCalibration;
