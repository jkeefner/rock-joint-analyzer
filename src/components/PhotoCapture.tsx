import React, { useState, useRef, useEffect } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Motion } from '@capacitor/motion';
import { FaceOrientation } from '../types';
import './PhotoCapture.css';

interface PhotoCaptureProps {
  onPhotoCaptured: (photo: string, width: number, height: number, orientation: FaceOrientation) => void;
}

const PhotoCapture: React.FC<PhotoCaptureProps> = ({ onPhotoCaptured }) => {
  const [photo, setPhoto] = useState<string | null>(null);
  const [azimuth, setAzimuth] = useState<number>(0);
  const [dip, setDip] = useState<number>(90);
  const [photoWidth, setPhotoWidth] = useState<number>(0);
  const [photoHeight, setPhotoHeight] = useState<number>(0);
  const [isReadingOrientation, setIsReadingOrientation] = useState<boolean>(false);
  const [orientationStatus, setOrientationStatus] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orientationRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);

  // Start listening to device orientation when component mounts
  useEffect(() => {
    let orientationHandler: any = null;
    
    const startOrientationListening = async () => {
      try {
        // Request permission for motion sensors
        const result = await Motion.addListener('orientation', (event) => {
          // alpha = compass heading (0-360)
          // beta = front-to-back tilt (-180 to 180, 0 = flat)
          // gamma = left-to-right tilt (-90 to 90)
          orientationRef.current = {
            alpha: event.alpha,
            beta: event.beta,
            gamma: event.gamma,
          };
        });
        orientationHandler = result;
        setOrientationStatus('📡 Orientation sensor active');
      } catch (error) {
        console.error('Error starting orientation listener:', error);
        setOrientationStatus('⚠️ Orientation sensor unavailable');
      }
    };

    startOrientationListening();

    return () => {
      if (orientationHandler) {
        orientationHandler.remove();
      }
    };
  }, []);

  const captureCurrentOrientation = () => {
    if (orientationRef.current) {
      const { alpha, beta } = orientationRef.current;
      
      // Alpha is compass heading (azimuth)
      const capturedAzimuth = Math.round(alpha || 0);
      
      // Beta indicates phone tilt
      // When phone is held vertically pointing at a wall: beta ≈ 0
      // When phone is horizontal (flat): beta ≈ 90 or -90
      // For a vertical rock face (dip=90), phone should be roughly horizontal
      // Dip calculation: when beta=0, face is vertical (90°); when beta=90, face is horizontal (0°)
      const capturedDip = Math.round(Math.max(0, Math.min(90, 90 - Math.abs(beta || 0))));
      
      setAzimuth(capturedAzimuth);
      setDip(capturedDip);
      setOrientationStatus(`✓ Captured: ${capturedAzimuth}° / ${capturedDip}°`);
      return { azimuth: capturedAzimuth, dip: capturedDip };
    }
    return null;
  };

  const takePhoto = async () => {
    try {
      setIsReadingOrientation(true);
      
      // Capture orientation just before taking photo
      const capturedOrientation = captureCurrentOrientation();
      
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (image.dataUrl) {
        loadImageDimensions(image.dataUrl);
        
        if (capturedOrientation) {
          setAzimuth(capturedOrientation.azimuth);
          setDip(capturedOrientation.dip);
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
    } finally {
      setIsReadingOrientation(false);
    }
  };

  const selectFromGallery = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });

      if (image.dataUrl) {
        loadImageDimensions(image.dataUrl);
      }
    } catch (error) {
      console.error('Error selecting photo:', error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        loadImageDimensions(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const loadImageDimensions = (dataUrl: string) => {
    const img = new Image();
    img.onload = () => {
      setPhotoWidth(img.width);
      setPhotoHeight(img.height);
      setPhoto(dataUrl);
    };
    img.src = dataUrl;
  };

  const handleRefreshOrientation = () => {
    captureCurrentOrientation();
  };

  const handleContinue = () => {
    if (photo) {
      onPhotoCaptured(photo, photoWidth, photoHeight, { azimuth, dip });
    }
  };

  const handleReset = () => {
    setPhoto(null);
    setPhotoWidth(0);
    setPhotoHeight(0);
    setOrientationStatus('');
  };

  return (
    <div className="photo-capture">
      <div className="capture-header">
        <h2>📸 Rock Joint Analyzer</h2>
        <p className="subtitle">Keefner Mining & Geotech LLC</p>
        {orientationStatus && (
          <p className="orientation-status">{orientationStatus}</p>
        )}
      </div>

      {!photo ? (
        <div className="capture-options">
          <p className="instructions">
            Capture or select a photo of the rock face for joint analysis.
            Point your phone at the rock face when taking a photo to auto-capture orientation.
          </p>
          
          <div className="button-group">
            <button className="btn-primary" onClick={takePhoto} disabled={isReadingOrientation}>
              {isReadingOrientation ? '📡 Reading orientation...' : '📷 Take Photo'}
            </button>
            <button className="btn-secondary" onClick={selectFromGallery}>
              🖼️ Select from Gallery
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => fileInputRef.current?.click()}
            >
              📁 Browse Files
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      ) : (
        <div className="photo-preview">
          <div className="preview-container">
            <img src={photo} alt="Captured rock face" />
            <div className="photo-info">
              {photoWidth} × {photoHeight} pixels
            </div>
          </div>

          <div className="orientation-inputs">
            <h3>📐 Face Orientation</h3>
            <p className="help-text">
              Orientation was captured from device sensors. Adjust if needed.
            </p>
            
            <div className="input-row">
              <div className="input-group">
                <label>
                  <span>Azimuth (°)</span>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={azimuth}
                    onChange={(e) => setAzimuth(Number(e.target.value))}
                  />
                  <span className="input-hint">Direction face is pointing (0-360°)</span>
                </label>
              </div>

              <div className="input-group">
                <label>
                  <span>Dip (°)</span>
                  <input
                    type="number"
                    min="0"
                    max="90"
                    value={dip}
                    onChange={(e) => setDip(Number(e.target.value))}
                  />
                  <span className="input-hint">Face angle from horizontal (90° = vertical)</span>
                </label>
              </div>
            </div>

            <button className="btn-refresh" onClick={handleRefreshOrientation}>
              🔄 Re-capture from device
            </button>
          </div>

          <div className="action-buttons">
            <button className="btn-secondary" onClick={handleReset}>
              ← Retake Photo
            </button>
            <button className="btn-primary" onClick={handleContinue}>
              Continue to Scale →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhotoCapture;
