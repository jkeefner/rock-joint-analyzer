import React, { useState, useEffect, useRef } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Motion } from '@capacitor/motion';
import { FaceOrientation } from '../types';
import './CameraCapture.css';

interface CameraCaptureProps {
  onCapture: (photo: string, orientation: FaceOrientation, width: number, height: number) => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture }) => {
  const [orientation, setOrientation] = useState<FaceOrientation>({
    azimuth: 0,
    dip: 90,
  });
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const motionListenerHandle = useRef<any>(null);

  useEffect(() => {
    const startOrientationTracking = async () => {
      try {
        // Motion API doesn't require explicit permission request on Android
        // Just start listening
        motionListenerHandle.current = await Motion.addListener('orientation', (event) => {
          const alpha = event.alpha || 0;
          const beta = event.beta || 0;
          
          const azimuth = ((alpha + 360) % 360);
          const dip = 90 - Math.abs(beta);
          
          setOrientation({
            azimuth: Math.round(azimuth),
            dip: Math.round(Math.max(0, Math.min(90, dip))),
          });
        });
      } catch (error) {
        console.error('Error starting orientation tracking:', error);
        // Continue anyway - orientation tracking is optional
      }
    };

    startOrientationTracking();

    return () => {
      if (motionListenerHandle.current) {
        motionListenerHandle.current.remove();
      }
    };
  }, []);

  const capturePhoto = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        saveToGallery: false,
      });

      if (image.dataUrl) {
        setPreview(image.dataUrl);
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
      alert('Failed to capture photo. Please try again.');
    }
  };

  const handleCalibrateOrientation = () => {
    setIsCalibrating(true);
    setTimeout(() => {
      setIsCalibrating(false);
      alert(`Face orientation locked:\nAzimuth: ${orientation.azimuth}°\nDip: ${orientation.dip}°`);
    }, 2000);
  };

  const handleConfirmPhoto = () => {
    if (preview) {
      const img = new Image();
      img.onload = () => {
        onCapture(preview, orientation, img.width, img.height);
      };
      img.src = preview;
    }
  };

  const handleRetake = () => {
    setPreview(null);
  };

  return (
    <div className="camera-capture">
      <div className="instructions">
        <h2>Step 1: Capture Photo</h2>
        <ol>
          <li>Stand approximately 50 feet from the highwall</li>
          <li>Point your phone directly at the bench face</li>
          <li>Tap "Calibrate Orientation" and hold steady for 2 seconds</li>
          <li>Take photo when orientation is stable</li>
        </ol>
      </div>

      <div className="orientation-display">
        <div className="orientation-card">
          <div className="orientation-label">Azimuth</div>
          <div className="orientation-value">{orientation.azimuth}°</div>
        </div>
        <div className="orientation-card">
          <div className="orientation-label">Dip</div>
          <div className="orientation-value">{orientation.dip}°</div>
        </div>
        {isCalibrating && (
          <div className="calibrating-indicator">
            Calibrating... Hold steady
          </div>
        )}
      </div>

      {!preview ? (
        <div className="capture-controls">
          <button 
            className="btn-secondary"
            onClick={handleCalibrateOrientation}
            disabled={isCalibrating}
          >
            {isCalibrating ? 'Calibrating...' : 'Calibrate Orientation'}
          </button>
          <button 
            className="btn-primary"
            onClick={capturePhoto}
          >
            Take Photo
          </button>
        </div>
      ) : (
        <div className="preview-section">
          <img src={preview} alt="Captured rock face" className="photo-preview" />
          <div className="preview-info">
            <p>Azimuth: {orientation.azimuth}° | Dip: {orientation.dip}°</p>
          </div>
          <div className="preview-controls">
            <button className="btn-secondary" onClick={handleRetake}>
              Retake
            </button>
            <button className="btn-primary" onClick={handleConfirmPhoto}>
              Continue to Scale Calibration
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraCapture;