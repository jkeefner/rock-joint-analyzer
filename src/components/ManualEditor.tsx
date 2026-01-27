import React, { useState, useRef, useEffect } from 'react';
import { ScaleData, Joint, Point } from '../types';
import { calculateDistance, calculateOrientation } from '../utils/imageProcessing';
import './ManualEditor.css';

interface ManualEditorProps {
  photo: string;
  scale: ScaleData;
  initialJoints: Joint[];
  onComplete: (joints: Joint[]) => void;
  onBack: () => void;
}

type EditMode = 'select' | 'add' | 'delete';

const ManualEditor: React.FC<ManualEditorProps> = ({
  photo,
  scale,
  initialJoints,
  onComplete,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [joints, setJoints] = useState<Joint[]>(initialJoints);
  const [mode, setMode] = useState<EditMode>('select');
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [hoveredJointId, setHoveredJointId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<{ jointId: string; point: 'start' | 'end' } | null>(null);
  
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      drawCanvas();
    };
    img.src = photo;
  }, [photo]);

  useEffect(() => {
    drawCanvas();
  }, [joints, mode, selectedJointId, tempPoints, hoveredJointId]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0);

    joints.forEach((joint) => {
      const isSelected = joint.id === selectedJointId;
      const isHovered = joint.id === hoveredJointId;

      ctx.strokeStyle = isSelected ? '#ff0000' : isHovered ? '#ffff00' : '#00ff00';
      ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(joint.start.x, joint.start.y);
      ctx.lineTo(joint.end.x, joint.end.y);
      ctx.stroke();

      if (isSelected || isHovered) {
        ctx.fillStyle = isSelected ? '#ff0000' : '#ffff00';
        ctx.beginPath();
        ctx.arc(joint.start.x, joint.start.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(joint.end.x, joint.end.y, 6, 0, 2 * Math.PI);
        ctx.fill();
      }

      const midX = (joint.start.x + joint.end.x) / 2;
      const midY = (joint.start.y + joint.end.y) / 2;
      
      if (isSelected || isHovered) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(midX - 30, midY - 20, 60, 25);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${joint.lengthMeters.toFixed(2)}m`, midX, midY - 2);
      }
    });

    if (mode === 'add' && tempPoints.length > 0) {
      tempPoints.forEach((point, index) => {
        ctx.fillStyle = '#ff00ff';
        ctx.beginPath();
        ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${index + 1}`, point.x, point.y + 4);
      });

      if (tempPoints.length === 2) {
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(tempPoints[0].x, tempPoints[0].y);
        ctx.lineTo(tempPoints[1].x, tempPoints[1].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 150, 40);
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Mode: ${mode.toUpperCase()}`, 20, 35);
  };

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const findJointAtPoint = (point: Point, threshold: number = 10): string | null => {
    for (const joint of joints) {
      const distToLine = pointToLineDistance(point, joint.start, joint.end);
      if (distToLine < threshold) {
        return joint.id;
      }
    }
    return null;
  };

  const findEndpointAtPoint = (
    point: Point, 
    threshold: number = 15
  ): { jointId: string; point: 'start' | 'end' } | null => {
    for (const joint of joints) {
      const distToStart = calculateDistance(point, joint.start);
      const distToEnd = calculateDistance(point, joint.end);
      
      if (distToStart < threshold) {
        return { jointId: joint.id, point: 'start' };
      }
      if (distToEnd < threshold) {
        return { jointId: joint.id, point: 'end' };
      }
    }
    return null;
  };

  const pointToLineDistance = (point: Point, lineStart: Point, lineEnd: Point): number => {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);

    if (mode === 'select') {
      const endpoint = findEndpointAtPoint(point);
      if (endpoint) {
        setIsDragging(true);
        setDragTarget(endpoint);
        setSelectedJointId(endpoint.jointId);
        return;
      }

      const jointId = findJointAtPoint(point);
      setSelectedJointId(jointId);
    } else if (mode === 'add') {
      if (tempPoints.length < 2) {
        setTempPoints([...tempPoints, point]);
        
        if (tempPoints.length === 1) {
          const newJoint = createJoint([tempPoints[0], point]);
          setJoints([...joints, newJoint]);
          setTempPoints([]);
        }
      }
    } else if (mode === 'delete') {
      const jointId = findJointAtPoint(point);
      if (jointId) {
        setJoints(joints.filter(j => j.id !== jointId));
        if (selectedJointId === jointId) {
          setSelectedJointId(null);
        }
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e);

    if (isDragging && dragTarget && mode === 'select') {
      setJoints(joints.map(joint => {
        if (joint.id === dragTarget.jointId) {
          const updatedJoint = { ...joint };
          if (dragTarget.point === 'start') {
            updatedJoint.start = point;
          } else {
            updatedJoint.end = point;
          }
          
          const lengthPixels = calculateDistance(updatedJoint.start, updatedJoint.end);
          updatedJoint.lengthPixels = lengthPixels;
          updatedJoint.lengthMeters = lengthPixels / scale.pixelsPerMeter;
          updatedJoint.orientation = calculateOrientation(updatedJoint.start, updatedJoint.end);
          
          return updatedJoint;
        }
        return joint;
      }));
    } else {
      const jointId = findJointAtPoint(point);
      setHoveredJointId(jointId);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setDragTarget(null);
  };

  const createJoint = (points: [Point, Point]): Joint => {
    const lengthPixels = calculateDistance(points[0], points[1]);
    const lengthMeters = lengthPixels / scale.pixelsPerMeter;
    const orientation = calculateOrientation(points[0], points[1]);

    return {
      id: `joint_${Date.now()}_${Math.random()}`,
      start: points[0],
      end: points[1],
      lengthPixels,
      lengthMeters,
      orientation,
    };
  };

  const handleDeleteSelected = () => {
    if (selectedJointId) {
      setJoints(joints.filter(j => j.id !== selectedJointId));
      setSelectedJointId(null);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to delete all joints?')) {
      setJoints([]);
      setSelectedJointId(null);
    }
  };

  const handleCancelAdd = () => {
    setTempPoints([]);
  };

  const handleComplete = () => {
    if (joints.length === 0) {
      const proceed = window.confirm(
        'No joints defined. Are you sure you want to continue?'
      );
      if (!proceed) return;
    }
    onComplete(joints);
  };

  const getCursorStyle = (): string => {
    if (mode === 'add') return 'crosshair';
    if (mode === 'delete') return 'not-allowed';
    if (isDragging) return 'grabbing';
    if (hoveredJointId) return 'pointer';
    return 'default';
  };

  return (
    <div className="manual-editor">
      <div className="instructions">
        <h2>Step 4: Manual Editing</h2>
        <p>
          Refine the detected joints: select and drag endpoints to adjust, add new joints, or delete incorrect ones.
        </p>
      </div>

      <div className="editor-layout">
        <div className="tools-panel">
          <h3>Tools</h3>

          <div className="mode-buttons">
            <button
              className={`mode-button ${mode === 'select' ? 'active' : ''}`}
              onClick={() => {
                setMode('select');
                setTempPoints([]);
              }}
            >
              <span className="icon">🔍</span>
              Select / Move
            </button>
            <button
              className={`mode-button ${mode === 'add' ? 'active' : ''}`}
              onClick={() => {
                setMode('add');
                setSelectedJointId(null);
              }}
            >
              <span className="icon">➕</span>
              Add Joint
            </button>
            <button
              className={`mode-button ${mode === 'delete' ? 'active' : ''}`}
              onClick={() => {
                setMode('delete');
                setSelectedJointId(null);
                setTempPoints([]);
              }}
            >
              <span className="icon">🗑️</span>
              Delete
            </button>
          </div>

          <div className="mode-instructions">
            {mode === 'select' && (
              <div>
                <strong>Select Mode:</strong>
                <ul>
                  <li>Click a joint to select it</li>
                  <li>Drag endpoints to adjust position</li>
                  <li>Use Delete button to remove selected joint</li>
                </ul>
              </div>
            )}
            {mode === 'add' && (
              <div>
                <strong>Add Mode:</strong>
                <ul>
                  <li>Click to place first endpoint</li>
                  <li>Click again to place second endpoint</li>
                  <li>Joint will be created automatically</li>
                </ul>
                {tempPoints.length > 0 && (
                  <button className="btn-secondary btn-small" onClick={handleCancelAdd}>
                    Cancel ({tempPoints.length}/2 points)
                  </button>
                )}
              </div>
            )}
            {mode === 'delete' && (
              <div>
                <strong>Delete Mode:</strong>
                <ul>
                  <li>Click any joint to delete it</li>
                  <li>Changes are immediate</li>
                </ul>
              </div>
            )}
          </div>

          <div className="selected-joint-info">
            {selectedJointId && mode === 'select' && (
              <div className="info-card">
                <h4>Selected Joint</h4>
                {(() => {
                  const joint = joints.find(j => j.id === selectedJointId);
                  if (!joint) return null;
                  return (
                    <div>
                      <p><strong>Length:</strong> {joint.lengthMeters.toFixed(2)} m</p>
                      <p><strong>Orientation:</strong> {joint.orientation?.toFixed(1)}°</p>
                      <button 
                        className="btn-danger btn-small"
                        onClick={handleDeleteSelected}
                      >
                        Delete This Joint
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          <div className="stats-panel">
            <h4>Current Statistics</h4>
            <div className="stat-item">
              <span className="stat-label">Total Joints:</span>
              <span className="stat-value">{joints.length}</span>
            </div>
            {joints.length > 0 && (
              <>
                <div className="stat-item">
                  <span className="stat-label">Avg Length:</span>
                  <span className="stat-value">
                    {(joints.reduce((sum, j) => sum + j.lengthMeters, 0) / joints.length).toFixed(2)} m
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Min Length:</span>
                  <span className="stat-value">
                    {Math.min(...joints.map(j => j.lengthMeters)).toFixed(2)} m
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Max Length:</span>
                  <span className="stat-value">
                    {Math.max(...joints.map(j => j.lengthMeters)).toFixed(2)} m
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="action-buttons">
            <button 
              className="btn-danger"
              onClick={handleClearAll}
              disabled={joints.length === 0}
            >
              Clear All Joints
            </button>
          </div>
        </div>

        <div className="canvas-panel">
          <div className="canvas-container">
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              style={{ cursor: getCursorStyle() }}
            />
          </div>

          <div className="legend">
            <span className="legend-item">
              <span className="legend-line" style={{ background: '#00ff00' }}></span>
              Normal Joint
            </span>
            <span className="legend-item">
              <span className="legend-line" style={{ background: '#ffff00' }}></span>
              Hovered Joint
            </span>
            <span className="legend-item">
              <span className="legend-line" style={{ background: '#ff0000' }}></span>
              Selected Joint
            </span>
            {mode === 'add' && (
              <span className="legend-item">
                <span className="legend-line" style={{ background: '#ff00ff' }}></span>
                New Joint (in progress)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="button-group">
        <button className="btn-secondary" onClick={onBack}>
          Back to Detection
        </button>
        <button
          className="btn-primary"
          onClick={handleComplete}
        >
          Complete Editing ({joints.length} joints)
        </button>
      </div>
    </div>
  );
};

export default ManualEditor;