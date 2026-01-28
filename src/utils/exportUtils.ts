import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
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
  const densityUnit = useImperial ? 'ft/ft²' : 'm/m²';
  
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
  csv += `P21 Density (${densityUnit}),${convertDensity(stats.p21).toFixed(4)}\n`;
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
 * Export full report to PDF using jsPDF
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
    // Dynamically import jsPDF
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default;
    
    // Create PDF document (portrait, points, letter size)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let yPos = margin;
    
    // Helper function to add text and track position
    const addText = (text: string, fontSize: number, isBold: boolean = false, color: number[] = [0, 0, 0]) => {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(text, margin, yPos);
      yPos += fontSize * 1.4;
    };
    
    // Helper to check if we need a new page
    const checkNewPage = (neededSpace: number) => {
      if (yPos + neededSpace > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
        return true;
      }
      return false;
    };
    
    // Title
    addText('Rock Joint Analysis Report', 18, true, [30, 58, 95]);
    yPos += 10;
    
    // Header info
    addText(`Site: ${projectData.siteName || 'Not specified'}`, 11);
    addText(`Date: ${projectData.timestamp ? new Date(projectData.timestamp).toLocaleString() : 'Not recorded'}`, 11);
    addText(`Units: ${useImperial ? 'Imperial (ft)' : 'Metric (m)'}`, 11);
    
    if (projectData.gpsCoordinates) {
      addText(`GPS: ${projectData.gpsCoordinates.latitude.toFixed(6)}, ${projectData.gpsCoordinates.longitude.toFixed(6)}`, 11);
    }
    
    if (projectData.faceOrientation) {
      addText(`Face Orientation: Azimuth ${projectData.faceOrientation.azimuth}°, Dip ${projectData.faceOrientation.dip}°`, 11);
    }
    
    yPos += 15;
    
    // Add annotated image if available
    if (canvas) {
      checkNewPage(300);
      addText('Annotated Image', 14, true);
      yPos += 5;
      
      try {
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const imgWidth = pageWidth - (margin * 2);
        const imgHeight = (canvas.height / canvas.width) * imgWidth;
        const maxImgHeight = 280;
        const finalHeight = Math.min(imgHeight, maxImgHeight);
        const finalWidth = (finalHeight / imgHeight) * imgWidth;
        
        doc.addImage(imgData, 'JPEG', margin, yPos, finalWidth, finalHeight);
        yPos += finalHeight + 20;
      } catch (imgError) {
        console.error('Error adding image to PDF:', imgError);
        addText('(Image could not be added)', 10);
      }
    }
    
    // Statistics section
    checkNewPage(150);
    addText('Fracture Statistics', 14, true);
    yPos += 5;
    
    const statsData = [
      ['Total Joints', `${stats.jointCount}`],
      ['Total Trace Length', `${convertLength(stats.totalLength).toFixed(2)} ${lengthUnit}`],
      ['Mean Length', `${convertLength(stats.meanLength).toFixed(3)} ${lengthUnit}`],
      ['Median Length', `${convertLength(stats.medianLength).toFixed(3)} ${lengthUnit}`],
      ['Length Range', `${convertLength(stats.minLength).toFixed(3)} - ${convertLength(stats.maxLength).toFixed(3)} ${lengthUnit}`],
      ['Area Analyzed', `${convertArea(stats.areaAnalyzed).toFixed(2)} ${areaUnit}`],
      ['P21 Density', `${convertDensity(stats.p21).toFixed(4)} ${densityUnit}`],
    ];
    
    statsData.forEach(([label, value]) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${label}:`, margin, yPos);
      doc.setFont('helvetica', 'bold');
      doc.text(value, margin + 120, yPos);
      yPos += 14;
    });
    
    yPos += 10;
    
    // Joint Sets section
    if (jointSets.length > 0) {
      checkNewPage(200);
      addText('Joint Set Orientation Clustering', 14, true);
      addText('(Joints grouped into 15° orientation bins)', 9, false, [100, 100, 100]);
      yPos += 5;
      
      // Table header
      const colWidths = [40, 80, 60, 60, 100, 100];
      const headers = ['Set', 'Orientation', 'Count', '%', `Mean Len (${lengthUnit})`, `Total Len (${lengthUnit})`];
      
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPos - 10, pageWidth - (margin * 2), 16, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      
      let xPos = margin + 5;
      headers.forEach((header, i) => {
        doc.text(header, xPos, yPos);
        xPos += colWidths[i];
      });
      yPos += 18;
      
      // Table rows
      doc.setFont('helvetica', 'normal');
      jointSets.forEach((set, index) => {
        if (checkNewPage(16)) {
          // Redraw header on new page
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, yPos - 10, pageWidth - (margin * 2), 16, 'F');
          doc.setFont('helvetica', 'bold');
          xPos = margin + 5;
          headers.forEach((header, i) => {
            doc.text(header, xPos, yPos);
            xPos += colWidths[i];
          });
          yPos += 18;
          doc.setFont('helvetica', 'normal');
        }
        
        xPos = margin + 5;
        const rowData = [
          `${set.id}`,
          `${set.meanOrientation}°`,
          `${set.count}`,
          `${((set.count / stats.jointCount) * 100).toFixed(1)}%`,
          `${convertLength(set.meanLength).toFixed(3)}`,
          `${convertLength(set.totalLength).toFixed(3)}`
        ];
        
        rowData.forEach((cell, i) => {
          doc.text(cell, xPos, yPos);
          xPos += colWidths[i];
        });
        yPos += 14;
      });
      
      yPos += 15;
    }
    
    // Individual Joint Data (if space permits)
    if (projectData.joints.length <= 30) {
      checkNewPage(100);
      addText('Individual Joint Data', 14, true);
      yPos += 5;
      
      const jointColWidths = [30, 70, 70, 90, 90];
      const jointHeaders = ['#', `Length (${lengthUnit})`, 'Orient (°)', 'Start (px)', 'End (px)'];
      
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPos - 10, pageWidth - (margin * 2), 16, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      
      let xPos = margin + 5;
      jointHeaders.forEach((header, i) => {
        doc.text(header, xPos, yPos);
        xPos += jointColWidths[i];
      });
      yPos += 16;
      
      doc.setFont('helvetica', 'normal');
      projectData.joints.forEach((joint, index) => {
        if (checkNewPage(14)) {
          // Redraw header
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, yPos - 10, pageWidth - (margin * 2), 16, 'F');
          doc.setFont('helvetica', 'bold');
          xPos = margin + 5;
          jointHeaders.forEach((header, i) => {
            doc.text(header, xPos, yPos);
            xPos += jointColWidths[i];
          });
          yPos += 16;
          doc.setFont('helvetica', 'normal');
        }
        
        xPos = margin + 5;
        const rowData = [
          `${index + 1}`,
          `${convertLength(joint.lengthMeters || 0).toFixed(3)}`,
          `${(joint.orientation || 0).toFixed(1)}`,
          `(${Math.round(joint.start.x)}, ${Math.round(joint.start.y)})`,
          `(${Math.round(joint.end.x)}, ${Math.round(joint.end.y)})`
        ];
        
        rowData.forEach((cell, i) => {
          doc.text(cell, xPos, yPos);
          xPos += jointColWidths[i];
        });
        yPos += 12;
      });
    } else {
      checkNewPage(30);
      addText(`Individual Joint Data: ${projectData.joints.length} joints (see CSV export for full data)`, 10, false, [100, 100, 100]);
    }
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Generated by Rock Joint Analyzer v1.5', margin, pageHeight - 30);
    doc.text('Note: Orientations shown are apparent orientations in the photograph plane.', margin, pageHeight - 20);
    
    // Save the PDF
    const filename = generateFilename(
      (projectData.siteName || 'rock_joint_report').replace(/[^a-zA-Z0-9]/g, '_'),
      'pdf'
    );
    
    // Get PDF as base64
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    
    // Save to filesystem
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
