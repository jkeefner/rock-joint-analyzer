import React, { useState, useRef } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const takePhoto = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });
      if (image.dataUrl) {
        loadImageDimensions(image.dataUrl);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
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

  const handleContinue = () => {
    if (photo) {
      onPhotoCaptured(photo, photoWidth, photoHeight, { azimuth, dip });
    }
  };

  const handleReset = () => {
    setPhoto(null);
    setPhotoWidth(0);
    setPhotoHeight(0);
  };

  return (
    <div className="photo-capture">
      <div className="capture-header">
        <h2>📸 Rock Joint Analyzer</h2>
        <p className="subtitle">Keefner Mining & Geotech LLC</p>
      </div>

      {!photo ? (
        <div className="capture-options">
          <p className="instructions">
            Capture or select a photo of the rock face for joint analysis.
          </p>
          <div className="button-group">
            <button className="btn-primary" onClick={takePhoto}>
              📷 Take Photo
            </button>
            <button className="btn-secondary" onClick={selectFromGallery}>
              🖼️ Select from Gallery
            </button>
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
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
              Enter the orientation of the rock face being photographed.
            </p>
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
