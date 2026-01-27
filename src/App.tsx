import React, { useState } from 'react';
import PhotoCapture from './components/PhotoCapture';
import ScaleCalibration from './components/ScaleCalibration';
import JointDetection from './components/JointDetection';
import ManualEditor from './components/ManualEditor';
import ResultsView from './components/ResultsView';
import { ProjectData, ScaleData, Joint, FaceOrientation, GPSCoordinates } from './types';
import './App.css';

type AppStep = 'capture' | 'scale' | 'detect' | 'edit' | 'results';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>('capture');
  const [projectData, setProjectData] = useState<ProjectData>({
    photo: '',
    photoWidth: 0,
    photoHeight: 0,
    faceOrientation: { azimuth: 0, dip: 90 },
    gpsCoordinates: null,
    scale: null,
    joints: [],
    timestamp: new Date().toISOString(),
  });

  const handlePhotoCaptured = (
    photo: string, 
    width: number, 
    height: number, 
    orientation: FaceOrientation,
    gps: GPSCoordinates | null
  ) => {
    setProjectData(prev => ({
      ...prev,
      photo,
      photoWidth: width,
      photoHeight: height,
      faceOrientation: orientation,
      gpsCoordinates: gps,
      timestamp: new Date().toISOString(),
    }));
    setCurrentStep('scale');
  };

  const handleScaleSet = (scale: ScaleData) => {
    setProjectData(prev => ({ ...prev, scale }));
    setCurrentStep('detect');
  };

  const handleJointsDetected = (joints: Joint[]) => {
    setProjectData(prev => ({ ...prev, joints }));
    setCurrentStep('edit');
  };

  const handleJointsEdited = (joints: Joint[]) => {
    setProjectData(prev => ({ ...prev, joints }));
    setCurrentStep('results');
  };

  const handleStartNew = () => {
    setProjectData({
      photo: '',
      photoWidth: 0,
      photoHeight: 0,
      faceOrientation: { azimuth: 0, dip: 90 },
      gpsCoordinates: null,
      scale: null,
      joints: [],
      timestamp: new Date().toISOString(),
    });
    setCurrentStep('capture');
  };

  return (
    <div className="app">
      {currentStep === 'capture' && (
        <PhotoCapture onPhotoCaptured={handlePhotoCaptured} />
      )}
      {currentStep === 'scale' && (
        <ScaleCalibration
          photo={projectData.photo}
          onScaleSet={handleScaleSet}
          onBack={() => setCurrentStep('capture')}
        />
      )}
      {currentStep === 'detect' && projectData.scale && (
        <JointDetection
          photo={projectData.photo}
          scale={projectData.scale}
          onDetected={handleJointsDetected}
          onBack={() => setCurrentStep('scale')}
        />
      )}
      {currentStep === 'edit' && projectData.scale && (
        <ManualEditor
          photo={projectData.photo}
          scale={projectData.scale}
          initialJoints={projectData.joints}
          onComplete={handleJointsEdited}
          onBack={() => setCurrentStep('detect')}
        />
      )}
      {currentStep === 'results' && (
        <ResultsView
          projectData={projectData}
          onStartNew={handleStartNew}
          onBack={() => setCurrentStep('edit')}
        />
      )}
    </div>
  );
};

export default App;
