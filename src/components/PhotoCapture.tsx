import React, { useState, useRef, useEffect } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Motion } from '@capacitor/motion';
import { Geolocation } from '@capacitor/geolocation';
import { FaceOrientation, GPSCoordinates } from '../types';
import './PhotoCapture.css';

interface PhotoCaptureProps {
  onPhotoCaptured: (
    photo: string, 
    width: number, 
    height: number, 
    orientation: FaceOrientation,
    gps: GPSCoordinates | null
  ) => void;
}

const PhotoCapture: React.FC<PhotoCaptureProps> = ({ onPhotoCaptured }) => {
  const [photo, setPhoto] = useState<string | null>(null);
  const [azimuth, setAzimuth] = useState<number>(0);
  const [dip, setDip] = useState<number>(90);
  const [photoWidth, setPhotoWidth] = useState<number>(0);
  const [photoHeight, setPhotoHeight] = useState<number>(0);
  const [isReadingOrientation, setIsReadingOrientation] = useState<boolean>(false);
  const [orientationStatus, setOrientationStatus] = useState<string>('');
  const [gpsCoordinates, setGpsCoordinates] = useState<GPSCoordinates | null>(null);
  const [gpsStatus, setGpsStatus] = useState<string>('');
  const [isLoadingGps, setIsLoadingGps] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orientationRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);

  // Start listening to device orientation when component mounts
  useEffect(() => {
    let orientationHandler: any = null;
    
    const startOrientationListening = async () => {
      try {
        const result = await Motion.addListener('orientation', (event) => {
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
      const capturedAzimuth = Math.round(alpha || 0);
      const capturedDip = Math.round(Math.max(0, Math.min(90, 90 - Math.abs(beta || 0))));
      
      setAzimuth(capturedAzimuth);
      setDip(capturedDip);
      setOrientationStatus(`✓ Captured: ${capturedAzimuth}° / ${capturedDip}°`);
      return { azimuth: capturedAzimuth, dip: capturedDip };
    }
    return null;
  };

  const captureGPS = async (): Promise<GPSCoordinates | null> => {
    try {
      setIsLoadingGps(true);
      setGpsStatus('📍 Getting location...');
      
      // Request permission first
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        const request = await Geolocation.requestPermissions();
        if (request.location !== 'granted') {
          setGpsStatus('⚠️ Location permission denied');
          return null;
        }
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      const coords: GPSCoordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        altitude: position.coords.altitude,
        accuracy: position.coords.accuracy,
      };

      setGpsCoordinates(coords);
      setGpsStatus(`✓ Location captured (±${coords.accuracy?.toFixed(0) || '?'}m)`);
      return coords;
    } catch (error) {
      console.error('Error getting GPS:', error);
      setGpsStatus('⚠️ Could not get location');
      return null;
    } finally {
      setIsLoadingGps(false);
    }
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

  const takePhoto = async () => {
    try {
      setIsReadingOrientation(true);
      
      // Capture orientation and GPS before taking photo
      const capturedOrientation = captureCurrentOrientation();
      const capturedGps = await captureGPS();
      
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
        if (capturedGps) {
          setGpsCoordinates(capturedGps);
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
        // Capture current GPS for gallery photos too
        await captureGPS();
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

  const handleRefreshGps = () => {
    captureGPS();
  };

  const handleContinue = () => {
    if (photo) {
      onPhotoCaptured(photo, photoWidth, photoHeight, { azimuth, dip }, gpsCoordinates);
    }
  };

  const handleReset = () => {
    setPhoto(null);
    setPhotoWidth(0);
    setPhotoHeight(0);
    setOrientationStatus('');
    setGpsStatus('');
    setGpsCoordinates(null);
  };

  return (
    <div className="photo-capture">
      <div className="capture-header">
        <h2>📸 Rock Joint Analyzer</h2>
        <p className="subtitle">Keefner Mining & Geotech LLC</p>
        <div className="status-indicators">
          {orientationStatus && (
            <span className="status-badge orientation">{orientationStatus}</span>
          )}
          {gpsStatus && (
            <span className="status-badge gps">{gpsStatus}</span>
          )}
        </div>
      </div>

      {!photo ? (
        <div className="capture-options">
          <p className="instructions">
            Capture or select a photo of the rock face for joint analysis.
            Point your phone at the rock face when taking a photo to auto-capture orientation and GPS.
          </p>
          
          <div className="button-group">
            <button className="btn-primary" onClick={takePhoto} disabled={isReadingOrientation || isLoadingGps}>
              {isReadingOrientation || isLoadingGps ? '📡 Capturing data...' : '📷 Take Photo'}
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
              Orientation captured from device sensors. Adjust if needed.
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
              🔄 Re-capture orientation
            </button>
          </div>

          <div className="gps-section">
            <h3>📍 GPS Location</h3>
            {gpsCoordinates ? (
              <div className="gps-display">
                <div className="gps-coord">
                  <span className="gps-label">Latitude:</span>
                  <span className="gps-value">{formatCoordinate(gpsCoordinates.latitude, true)}</span>
                </div>
                <div className="gps-coord">
                  <span className="gps-label">Longitude:</span>
                  <span className="gps-value">{formatCoordinate(gpsCoordinates.longitude, false)}</span>
                </div>
                {gpsCoordinates.altitude !== null && (
                  <div className="gps-coord">
                    <span className="gps-label">Elevation:</span>
                    <span className="gps-value">{gpsCoordinates.altitude.toFixed(1)} m</span>
                  </div>
                )}
                {gpsCoordinates.accuracy !== null && (
                  <div className="gps-coord">
                    <span className="gps-label">Accuracy:</span>
                    <span className="gps-value">±{gpsCoordinates.accuracy.toFixed(0)} m</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="no-gps">No GPS data captured</p>
            )}
            <button className="btn-refresh" onClick={handleRefreshGps} disabled={isLoadingGps}>
              {isLoadingGps ? '📍 Getting location...' : '🔄 Re-capture GPS'}
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
