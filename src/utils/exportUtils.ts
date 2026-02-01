import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProjectData, FractureStats, Joint, ScaleData } from '../types';

// Unit conversion constants
const METERS_TO_FEET = 3.28084;
const SQ_METERS_TO_SQ_FEET = 10.7639;

interface JointSet {
  id: number;
  meanOrientation: number;
  count: number;
  joints: Joint[];
  totalLength: number;
  meanLength: number;
  color: string;
}

/**
 * Calculate fracture statistics from detected joints
 */
export const calculateFractureStats = (
  joints: Joint[],
  scale: ScaleData,
  photoWidth: number,
  photoHeight: number
): FractureStats => {
  // Calculate area in square meters
  const widthMeters = photoWidth / scale.pixelsPerMeter;
  const heightMeters = photoHeight / scale.pixelsPerMeter;
  const areaAnalyzed = widthMeters * heightMeters;

  // Calculate total trace length
  const totalLength = joints.reduce((sum, joint) => sum + (joint.lengthMeters || 0), 0);

  // Calculate statistics
  const meanLength = joints.length > 0 ? totalLength / joints.length : 0;
  
  const sortedLengths = joints.map(j => j.lengthMeters || 0).sort((a, b) => a - b);
  const medianLength = joints.length > 0 
    ? sortedLengths[Math.floor(sortedLengths.length / 2)] 
    : 0;
  
  const minLength = joints.length > 0 ? Math.min(...sortedLengths) : 0;
  const maxLength = joints.length > 0 ? Math.max(...sortedLengths) : 0;

  // P21 = Total trace length / Area
  const p21 = areaAnalyzed > 0 ? totalLength / areaAnalyzed : 0;
  
  // Frequency = Number of joints / scan line length (approximate as sqrt of area)
  const scanLineLength = Math.sqrt(areaAnalyzed);
  const frequency = scanLineLength > 0 ? joints.length / scanLineLength : 0;

  return {
    totalLength,
    meanLength,
    medianLength,
    minLength,
    maxLength,
    areaAnalyzed,
    p21,
    frequency,
    jointCount: joints.length
  };
};

/**
 * Generate a unique filename with timestamp
 */
const generateFilename = (prefix: string, extension: string): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}_${timestamp}.${extension}`;
};

/**
 * Format length with unit conversion
 */
const formatLength = (meters: number, useImperial: boolean): string => {
  if (useImperial) {
    return `${(meters * METERS_TO_FEET).toFixed(3)} ft`;
  }
  return `${meters.toFixed(3)} m`;
};

/**
 * Format area with unit conversion
 */
const formatArea = (sqMeters: number, useImperial: boolean): string => {
  if (useImperial) {
    return `${(sqMeters * SQ_METERS_TO_SQ_FEET).toFixed(2)} ft²`;
  }
  return `${sqMeters.toFixed(2)} m²`;
};

/**
 * Format density with unit conversion
 */
const formatDensity = (density: number, useImperial: boolean): string => {
  if (useImperial) {
    return `${(density / METERS_TO_FEET * SQ_METERS_TO_SQ_FEET).toFixed(4)} ft/ft²`;
  }
  return `${density.toFixed(4)} m/m²`;
};

/**
 * Export annotated image from canvas
 */
export const exportToImage = async (
  canvas: HTMLCanvasElement | null,
  siteName: string
): Promise<void> => {
  if (!canvas) {
    throw new Error('Canvas not available for export');
  }

  try {
    // Get canvas as base64 PNG
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.split(',')[1];
    
    const filename = generateFilename(
      siteName.replace(/[^a-zA-Z0-9]/g, '_') || 'rock_joint_analysis',
      'png'
    );

    // Save to filesystem
    const result = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Documents,
    });

    console.log('Image saved:', result.uri);

    // Share the file
    await Share.share({
      title: 'Rock Joint Analysis Image',
      text: `Annotated joint analysis image - ${siteName}`,
      url: result.uri,
      dialogTitle: 'Share Analysis Image'
    });

  } catch (error) {
    console.error('Image export error:', error);
    throw error;
  }
};

/**
 * Export data to CSV format
 */
export const exportToCSV = async (
  projectData: ProjectData,
  stats: FractureStats,
  jointSets: JointSet[],
  useImperial: boolean
): Promise<void> => {
  const lengthUnit = useImperial ? 'ft' : 'm';
  const areaUnit = useImperial ? 'ft²' : 'm²';
  
  const convertLength = (m: number) => useImperial ? m * METERS_TO_FEET : m;
  const convertArea = (m2: number) => useImperial ? m2 * SQ_METERS_TO_SQ_FEET : m2;
  const convertDensity = (d: number) => useImperial ? d / METERS_TO_FEET * SQ_METERS_TO_SQ_FEET : d;

  // Build CSV content
  let csv = '';
  
  // Header section
  csv += 'Rock Joint Analysis Report\n';
  csv += `Site,${projectData.siteName || 'Unknown'}\n`;
  csv += `Date,${projectData.timestamp ? new Date(projectData.timestamp).toLocaleString() : 'Unknown'}\n`;
  csv += `Units,${useImperial ? 'Imperial' : 'Metric'}\n`;
  csv += '\n';

  // Statistics section
  csv += 'FRACTURE STATISTICS\n';
  csv += `Total Joints,${stats.jointCount}\n`;
  csv += `Total Trace Length (${lengthUnit}),${convertLength(stats.totalLength).toFixed(3)}\n`;
  csv += `Mean Length (${lengthUnit}),${convertLength(stats.meanLength).toFixed(3)}\n`;
  csv += `Median Length (${lengthUnit}),${convertLength(stats.medianLength).toFixed(3)}\n`;
  csv += `Min Length (${lengthUnit}),${convertLength(stats.minLength).toFixed(3)}\n`;
  csv += `Max Length (${lengthUnit}),${convertLength(stats.maxLength).toFixed(3)}\n`;
  csv += `Area Analyzed (${areaUnit}),${convertArea(stats.areaAnalyzed).toFixed(2)}\n`;
  csv += `P21 Density,${convertDensity(stats.p21).toFixed(4)}\n`;
  csv += '\n';

  // Joint Sets section
  if (jointSets.length > 0) {
    csv += 'JOINT SET CLUSTERING (15° bins)\n';
    csv += `Set,Orientation (°),Count,Percentage (%),Mean Length (${lengthUnit}),Total Length (${lengthUnit})\n`;
    jointSets.forEach(set => {
      const pct = ((set.count / stats.jointCount) * 100).toFixed(1);
      csv += `${set.id},${set.meanOrientation},${set.count},${pct},${convertLength(set.meanLength).toFixed(3)},${convertLength(set.totalLength).toFixed(3)}\n`;
    });
    csv += '\n';
  }

  // Individual joints section
  csv += 'INDIVIDUAL JOINT DATA\n';
  csv += `Joint #,Length (${lengthUnit}),Orientation (°),Start X (px),Start Y (px),End X (px),End Y (px)\n`;
  projectData.joints.forEach((joint, index) => {
    csv += `${index + 1},${convertLength(joint.lengthMeters || 0).toFixed(3)},${(joint.orientation || 0).toFixed(1)},`;
    csv += `${Math.round(joint.start.x)},${Math.round(joint.start.y)},${Math.round(joint.end.x)},${Math.round(joint.end.y)}\n`;
  });

  try {
    const filename = generateFilename(
      (projectData.siteName || 'rock_joint_analysis').replace(/[^a-zA-Z0-9]/g, '_'),
      'csv'
    );

    const result = await Filesystem.writeFile({
      path: filename,
      data: csv,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    });

    console.log('CSV saved:', result.uri);

    await Share.share({
      title: 'Rock Joint Analysis Data',
      text: `CSV data export - ${projectData.siteName || 'Analysis'}`,
      url: result.uri,
      dialogTitle: 'Share CSV Data'
    });

  } catch (error) {
    console.error('CSV export error:', error);
    throw error;
  }
};

/**
 * Export full report to PDF using jsPDF and autoTable
 */
export const exportToPDF = async (
  projectData: ProjectData,
  stats: FractureStats,
  jointSets: JointSet[],
  canvas: HTMLCanvasElement | null,
  useImperial: boolean
): Promise<void> => {
  const lengthUnit = useImperial ? 'ft' : 'm';
  const areaUnit = useImperial ? 'ft²' : 'm²';
  const densityUnit = useImperial ? 'ft/ft²' : 'm/m²';
  
  const convertLength = (m: number) => useImperial ? m * METERS_TO_FEET : m;
  const convertArea = (m2: number) => useImperial ? m2 * SQ_METERS_TO_SQ_FEET : m2;
  const convertDensity = (d: number) => useImperial ? d / METERS_TO_FEET * SQ_METERS_TO_SQ_FEET : d;

  try {
    // Create PDF document (portrait, mm, A4)
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;

    // === PAGE 1: Title and Statistics ===
    
    // Title
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Rock Joint Analysis Report', margin, margin + 10);

    // Metadata
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Site: ${projectData.siteName || 'Not specified'}`, margin, margin + 18);
    pdf.text(`Date: ${projectData.timestamp ? new Date(projectData.timestamp).toLocaleString() : 'Not recorded'}`, margin, margin + 24);
    pdf.text(`Units: ${useImperial ? 'Imperial' : 'Metric'}`, margin, margin + 30);

    if (projectData.gpsCoordinates) {
      pdf.text(`GPS: ${projectData.gpsCoordinates.latitude.toFixed(6)}, ${projectData.gpsCoordinates.longitude.toFixed(6)}`, margin, margin + 36);
    }

    // Face Orientation
    let yPos = margin + 48;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Face Orientation', margin, yPos);

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    yPos += 7;
    pdf.text(`Azimuth: ${projectData.faceOrientation.azimuth}°`, margin + 5, yPos);
    yPos += 6;
    pdf.text(`Dip: ${projectData.faceOrientation.dip}°`, margin + 5, yPos);

    // Statistics Summary
    yPos += 12;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Fracture Statistics Summary', margin, yPos);
    yPos += 5;

    const summaryData = [
      ['Total Joints', `${stats.jointCount}`],
      ['Total Trace Length', `${convertLength(stats.totalLength).toFixed(3)} ${lengthUnit}`],
      ['Mean Trace Length', `${convertLength(stats.meanLength).toFixed(3)} ${lengthUnit}`],
      ['Median Trace Length', `${convertLength(stats.medianLength).toFixed(3)} ${lengthUnit}`],
      ['Min Trace Length', `${convertLength(stats.minLength).toFixed(3)} ${lengthUnit}`],
      ['Max Trace Length', `${convertLength(stats.maxLength).toFixed(3)} ${lengthUnit}`],
      ['Image Area', `${convertArea(stats.areaAnalyzed).toFixed(2)} ${areaUnit}`],
      ['Fracture Density (P21)', `${convertDensity(stats.p21).toFixed(4)} ${densityUnit}`],
      ['Fracture Frequency', `${(stats.jointCount / Math.sqrt(convertArea(stats.areaAnalyzed))).toFixed(2)} joints/${lengthUnit}`],
    ];

    autoTable(pdf, {
      startY: yPos,
      head: [['Parameter', 'Value']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [52, 152, 219] },
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 }
    });

    // Joint Sets Table (if exists)
    if (jointSets.length > 0) {
      yPos = (pdf as any).lastAutoTable.finalY + 10;
      
      // Check if we need a new page for rosette + table
      if (yPos > pageHeight - 140) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Joint Set Orientation Clusters', margin, yPos);
      yPos += 8;

      // Draw Rosette Diagram
      const rosetteCenterX = margin + 40;
      const rosetteCenterY = yPos + 40;
      const rosetteRadius = 35;
      
      // Background circle
      pdf.setDrawColor(200, 200, 200);
      pdf.setFillColor(248, 249, 250);
      pdf.circle(rosetteCenterX, rosetteCenterY, rosetteRadius, 'FD');
      
      // Concentric circles
      pdf.setDrawColor(220, 220, 220);
      [0.25, 0.5, 0.75].forEach(scale => {
        pdf.circle(rosetteCenterX, rosetteCenterY, rosetteRadius * scale, 'S');
      });
      
      // Cross lines (N-S, E-W)
      pdf.setDrawColor(180, 180, 180);
      pdf.line(rosetteCenterX, rosetteCenterY - rosetteRadius, rosetteCenterX, rosetteCenterY + rosetteRadius);
      pdf.line(rosetteCenterX - rosetteRadius, rosetteCenterY, rosetteCenterX + rosetteRadius, rosetteCenterY);
      
      // Direction labels
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      pdf.text('N', rosetteCenterX - 2, rosetteCenterY - rosetteRadius - 2);
      pdf.text('S', rosetteCenterX - 2, rosetteCenterY + rosetteRadius + 5);
      pdf.text('E', rosetteCenterX + rosetteRadius + 2, rosetteCenterY + 1);
      pdf.text('W', rosetteCenterX - rosetteRadius - 6, rosetteCenterY + 1);
      
      // Draw rose petals for each joint set
      const maxCount = Math.max(...jointSets.map(s => s.count));
      
      jointSets.forEach((set) => {
        // Convert hex color to RGB
        const hexToRgb = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
          } : { r: 0, g: 255, b: 0 };
        };
        
        const rgb = hexToRgb(set.color);
        pdf.setFillColor(rgb.r, rgb.g, rgb.b);
        pdf.setDrawColor(rgb.r, rgb.g, rgb.b);
        
        // Convert orientation to radians
        // In PDF: Y increases downward, so we negate Y components
        // 0° = North (up), 90° = East (right), 180° = South (down), 270° = West (left)
        const angleRad = set.meanOrientation * (Math.PI / 180);
        const oppositeRad = angleRad + Math.PI;
        
        // Scale petal length by count
        const petalLength = (set.count / maxCount) * rosetteRadius * 0.85 + rosetteRadius * 0.15;
        
        // Draw bidirectional petal as two triangles
        const halfWidth = 7.5 * (Math.PI / 180); // 7.5 degrees half-width
        
        // Helper to convert angle to PDF coordinates (0° = up/North)
        const toX = (angle: number, radius: number) => rosetteCenterX + Math.sin(angle) * radius;
        const toY = (angle: number, radius: number) => rosetteCenterY - Math.cos(angle) * radius;
        
        // First petal (primary direction)
        const p1x = toX(angleRad - halfWidth, 5);
        const p1y = toY(angleRad - halfWidth, 5);
        const p2x = toX(angleRad, petalLength);
        const p2y = toY(angleRad, petalLength);
        const p3x = toX(angleRad + halfWidth, 5);
        const p3y = toY(angleRad + halfWidth, 5);
        
        pdf.triangle(p1x, p1y, p2x, p2y, p3x, p3y, 'F');
        
        // Opposite petal
        const p4x = toX(oppositeRad - halfWidth, 5);
        const p4y = toY(oppositeRad - halfWidth, 5);
        const p5x = toX(oppositeRad, petalLength);
        const p5y = toY(oppositeRad, petalLength);
        const p6x = toX(oppositeRad + halfWidth, 5);
        const p6y = toY(oppositeRad + halfWidth, 5);
        
        pdf.triangle(p4x, p4y, p5x, p5y, p6x, p6y, 'F');
      });
      
      // Center circle
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(100, 100, 100);
      pdf.circle(rosetteCenterX, rosetteCenterY, 4, 'FD');
      
      // Reset text color
      pdf.setTextColor(0, 0, 0);
      
      // Joint Sets Table (to the right of rosette)
      const tableStartX = margin + 90;
      yPos += 2;

      const setData = jointSets.map(set => [
        `Set ${set.id}`,
        `${set.meanOrientation}°`,
        set.count.toString(),
        `${((set.count / stats.jointCount) * 100).toFixed(1)}%`,
        `${convertLength(set.meanLength).toFixed(3)} ${lengthUnit}`,
        `${convertLength(set.totalLength).toFixed(3)} ${lengthUnit}`
      ]);

      autoTable(pdf, {
        startY: yPos,
        head: [['Set', 'Orient', 'Count', '%', 'Mean Len', 'Total Len']],
        body: setData,
        theme: 'striped',
        headStyles: { fillColor: [230, 126, 34], fontSize: 7 },
        margin: { left: tableStartX, right: margin },
        styles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 15 },
          2: { cellWidth: 15 },
          3: { cellWidth: 12 },
          4: { cellWidth: 22 },
          5: { cellWidth: 22 }
        }
      });
      
      // Update yPos to be below both rosette and table
      const rosetteBottom = rosetteCenterY + rosetteRadius + 10;
      const tableBottom = (pdf as any).lastAutoTable.finalY;
      yPos = Math.max(rosetteBottom, tableBottom) + 5;
    }

    // === PAGE 2: Annotated Image ===
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Annotated Image', margin, margin + 10);

    if (canvas) {
      try {
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const imgWidth = pageWidth - 2 * margin;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const maxHeight = pageHeight - 2 * margin - 20;

        if (imgHeight > maxHeight) {
          const scale = maxHeight / imgHeight;
          pdf.addImage(imgData, 'JPEG', margin, margin + 15, imgWidth * scale, imgHeight * scale);
        } else {
          pdf.addImage(imgData, 'JPEG', margin, margin + 15, imgWidth, imgHeight);
        }
      } catch (imgError) {
        console.error('Error adding image to PDF:', imgError);
        pdf.setFontSize(10);
        pdf.text('(Image could not be added to PDF)', margin, margin + 25);
      }
    } else {
      pdf.setFontSize(10);
      pdf.text('(No annotated image available)', margin, margin + 25);
    }

    // === PAGE 3: Individual Joint Data ===
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Individual Joint Data', margin, margin + 10);

    const jointTableData = projectData.joints.map((joint, index) => {
      const setInfo = jointSets.find(s => s.joints.some(j => j.id === joint.id));
      return [
        (index + 1).toString(),
        `${convertLength(joint.lengthMeters || 0).toFixed(3)}`,
        joint.lengthPixels.toFixed(1),
        (joint.orientation || 0).toFixed(1),
        setInfo ? `Set ${setInfo.id}` : '-',
        `(${joint.start.x.toFixed(0)}, ${joint.start.y.toFixed(0)})`,
        `(${joint.end.x.toFixed(0)}, ${joint.end.y.toFixed(0)})`
      ];
    });

    autoTable(pdf, {
      startY: margin + 15,
      head: [['#', `Length (${lengthUnit})`, 'Length (px)', 'Orient (°)', 'Set', 'Start (px)', 'End (px)']],
      body: jointTableData,
      theme: 'striped',
      headStyles: { fillColor: [46, 204, 113] },
      margin: { left: margin, right: margin },
      styles: { fontSize: 7 }
    });

    // Footer on last page
    const finalY = (pdf as any).lastAutoTable.finalY + 15;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100, 100, 100);
    pdf.text('Generated by Rock Joint Analyzer v1.5', margin, finalY);
    pdf.text('Note: Orientations are apparent orientations in the photograph plane.', margin, finalY + 5);

    // Generate PDF as base64
    const pdfBase64 = pdf.output('datauristring').split(',')[1];

    // Save to filesystem
    const filename = generateFilename(
      (projectData.siteName || 'rock_joint_report').replace(/[^a-zA-Z0-9]/g, '_'),
      'pdf'
    );

    const result = await Filesystem.writeFile({
      path: filename,
      data: pdfBase64,
      directory: Directory.Documents,
    });

    console.log('PDF saved:', result.uri);

    // Share the file
    await Share.share({
      title: 'Rock Joint Analysis Report',
      text: `PDF Report - ${projectData.siteName || 'Analysis'}`,
      url: result.uri,
      dialogTitle: 'Share PDF Report'
    });

  } catch (error) {
    console.error('PDF export error:', error);
    throw error;
  }
};
