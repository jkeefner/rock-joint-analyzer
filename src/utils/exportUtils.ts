import { ProjectData, FractureStats } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

const saveAndShareFile = async (
  fileName: string,
  data: string,
  mimeType: string
): Promise<void> => {
  if (isNativePlatform()) {
    try {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: data,
        directory: Directory.Documents,
        recursive: true,
      });
      await Share.share({
        title: fileName,
        url: result.uri,
        dialogTitle: 'Save or Share Report',
      });
    } catch (error) {
      console.error('Error saving/sharing file:', error);
      throw new Error(`Failed to save file: ${error}`);
    }
  } else {
    const byteCharacters = atob(data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
};

const saveAndShareTextFile = async (
  fileName: string,
  content: string,
  mimeType: string
): Promise<void> => {
  if (isNativePlatform()) {
    try {
      const result = await Filesystem.writeFile({
        path: fileName,
        data: content,
        directory: Directory.Documents,
        encoding: 'utf8' as any,
        recursive: true,
      });
      await Share.share({
        title: fileName,
        url: result.uri,
        dialogTitle: 'Save or Share Data',
      });
    } catch (error) {
      console.error('Error saving/sharing file:', error);
      throw new Error(`Failed to save file: ${error}`);
    }
  } else {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }
};

const formatCoordinateDMS = (value: number, isLatitude: boolean): string => {
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

export const calculateFractureStats = (
  joints: any[],
  scale: any,
  imageWidth: number,
  imageHeight: number
): FractureStats => {
  if (joints.length === 0) {
    return {
      totalJoints: 0,
      meanTraceLength: 0,
      minTraceLength: 0,
      maxTraceLength: 0,
      totalTraceLengthMeters: 0,
      imageAreaM2: 0,
      fractureDensityP21: 0,
      traceLengthDistribution: [],
    };
  }

  const traceLengths = joints.map(j => j.lengthMeters);
  const totalTraceLengthMeters = traceLengths.reduce((sum, len) => sum + len, 0);
  const meanTraceLength = totalTraceLengthMeters / joints.length;
  const minTraceLength = Math.min(...traceLengths);
  const maxTraceLength = Math.max(...traceLengths);

  const imageWidthMeters = imageWidth / scale.pixelsPerMeter;
  const imageHeightMeters = imageHeight / scale.pixelsPerMeter;
  const imageAreaM2 = imageWidthMeters * imageHeightMeters;
  const fractureDensityP21 = totalTraceLengthMeters / imageAreaM2;

  const numBins = 10;
  const binSize = (maxTraceLength - minTraceLength) / numBins || 1;
  const traceLengthDistribution = new Array(numBins).fill(0);

  traceLengths.forEach(length => {
    const binIndex = Math.min(
      Math.floor((length - minTraceLength) / binSize),
      numBins - 1
    );
    traceLengthDistribution[binIndex]++;
  });

  return {
    totalJoints: joints.length,
    meanTraceLength,
    minTraceLength,
    maxTraceLength,
    totalTraceLengthMeters,
    imageAreaM2,
    fractureDensityP21,
    traceLengthDistribution,
  };
};

export const exportToPDF = async (
  projectData: ProjectData,
  stats: FractureStats,
  canvas: HTMLCanvasElement | null
): Promise<void> => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;

  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Rock Joint Analysis Report', margin, margin + 10);

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Analysis Date: ${new Date(projectData.timestamp).toLocaleString()}`, margin, margin + 18);

  let yPos = margin + 30;

  // Face Orientation
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Face Orientation', margin, yPos);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  yPos += 7;
  pdf.text(`Azimuth: ${projectData.faceOrientation.azimuth}°`, margin + 5, yPos);
  yPos += 6;
  pdf.text(`Dip: ${projectData.faceOrientation.dip}°`, margin + 5, yPos);

  // GPS Location
  if (projectData.gpsCoordinates) {
    yPos += 12;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('GPS Location', margin, yPos);

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    yPos += 7;
    pdf.text(`Latitude: ${formatCoordinateDMS(projectData.gpsCoordinates.latitude, true)}`, margin + 5, yPos);
    yPos += 6;
    pdf.text(`Longitude: ${formatCoordinateDMS(projectData.gpsCoordinates.longitude, false)}`, margin + 5, yPos);
    if (projectData.gpsCoordinates.altitude !== null) {
      yPos += 6;
      pdf.text(`Elevation: ${projectData.gpsCoordinates.altitude.toFixed(1)} m`, margin + 5, yPos);
    }
  }

  // Fracture Statistics
  yPos += 12;
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Fracture Statistics Summary', margin, yPos);

  yPos += 7;

  const summaryData = [
    ['Total Joints', stats.totalJoints.toString()],
    ['Mean Trace Length', `${stats.meanTraceLength.toFixed(3)} m`],
    ['Min Trace Length', `${stats.minTraceLength.toFixed(3)} m`],
    ['Max Trace Length', `${stats.maxTraceLength.toFixed(3)} m`],
    ['Total Trace Length', `${stats.totalTraceLengthMeters.toFixed(3)} m`],
    ['Image Area', `${stats.imageAreaM2.toFixed(2)} m²`],
    ['Fracture Density (P21)', `${stats.fractureDensityP21.toFixed(4)} m/m²`],
    ['Fracture Frequency', `${(stats.totalJoints / Math.sqrt(stats.imageAreaM2)).toFixed(2)} joints/m`],
  ];

  autoTable(pdf, {
    startY: yPos,
    head: [['Parameter', 'Value']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [52, 152, 219] },
    margin: { left: margin, right: margin },
  });

  // Page 2 - Image
  pdf.addPage();

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Annotated Image', margin, margin + 10);

  if (canvas) {
    const imgData = canvas.toDataURL('image/jpeg', 0.8);
    const imgWidth = pageWidth - 2 * margin;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (imgHeight > pageHeight - 2 * margin - 20) {
      const scale = (pageHeight - 2 * margin - 20) / imgHeight;
      pdf.addImage(imgData, 'JPEG', margin, margin + 15, imgWidth * scale, imgHeight * scale);
    } else {
      pdf.addImage(imgData, 'JPEG', margin, margin + 15, imgWidth, imgHeight);
    }
  }

  // Page 3 - Joint Data
  pdf.addPage();

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Individual Joint Data', margin, margin + 10);

  const jointTableData = projectData.joints.map((joint, index) => [
    (index + 1).toString(),
    joint.lengthMeters.toFixed(3),
    joint.lengthPixels.toFixed(1),
    joint.orientation?.toFixed(1) || 'N/A',
    `(${joint.start.x.toFixed(0)}, ${joint.start.y.toFixed(0)})`,
    `(${joint.end.x.toFixed(0)}, ${joint.end.y.toFixed(0)})`,
  ]);

  autoTable(pdf, {
    startY: margin + 15,
    head: [['#', 'Length (m)', 'Length (px)', 'Orientation (°)', 'Start Point', 'End Point']],
    body: jointTableData,
    theme: 'striped',
    headStyles: { fillColor: [52, 73, 94] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 8 },
  });

  const fileName = `joint-analysis-${new Date().toISOString().split('T')[0]}.pdf`;
  const pdfBase64 = pdf.output('datauristring').split(',')[1];
  
  await saveAndShareFile(fileName, pdfBase64, 'application/pdf');
};

export const exportToCSV = async (projectData: ProjectData, stats: FractureStats): Promise<void> => {
  const rows: string[] = [];

  rows.push('Rock Joint Analysis Data');
  rows.push(`Analysis Date,${new Date(projectData.timestamp).toLocaleString()}`);
  rows.push('');

  rows.push('Face Orientation');
  rows.push(`Azimuth,${projectData.faceOrientation.azimuth}`);
  rows.push(`Dip,${projectData.faceOrientation.dip}`);
  rows.push('');

  if (projectData.gpsCoordinates) {
    rows.push('GPS Location');
    rows.push(`Latitude,${projectData.gpsCoordinates.latitude}`);
    rows.push(`Longitude,${projectData.gpsCoordinates.longitude}`);
    if (projectData.gpsCoordinates.altitude !== null) {
      rows.push(`Elevation (m),${projectData.gpsCoordinates.altitude.toFixed(1)}`);
    }
    rows.push('');
  }

  rows.push('Summary Statistics');
  rows.push(`Total Joints,${stats.totalJoints}`);
  rows.push(`Mean Trace Length (m),${stats.meanTraceLength.toFixed(3)}`);
  rows.push(`Min Trace Length (m),${stats.minTraceLength.toFixed(3)}`);
  rows.push(`Max Trace Length (m),${stats.maxTraceLength.toFixed(3)}`);
  rows.push(`Total Trace Length (m),${stats.totalTraceLengthMeters.toFixed(3)}`);
  rows.push(`Image Area (m²),${stats.imageAreaM2.toFixed(2)}`);
  rows.push(`Fracture Density P21 (m/m²),${stats.fractureDensityP21.toFixed(4)}`);
  rows.push(`Fracture Frequency (joints/m),${(stats.totalJoints / Math.sqrt(stats.imageAreaM2)).toFixed(2)}`);
  rows.push('');

  rows.push('Individual Joint Data');
  rows.push('Joint #,Length (m),Length (pixels),Orientation (°),Start X,Start Y,End X,End Y');

  projectData.joints.forEach((joint, index) => {
    rows.push(
      `${index + 1},${joint.lengthMeters.toFixed(3)},${joint.lengthPixels.toFixed(1)},${
        joint.orientation?.toFixed(1) || 'N/A'
      },${joint.start.x.toFixed(0)},${joint.start.y.toFixed(0)},${joint.end.x.toFixed(0)},${joint.end.y.toFixed(0)}`
    );
  });

  const csvContent = rows.join('\n');
  const fileName = `joint-analysis-${new Date().toISOString().split('T')[0]}.csv`;
  
  await saveAndShareTextFile(fileName, csvContent, 'text/csv');
};

export const exportToImage = async (canvas: HTMLCanvasElement | null): Promise<void> => {
  if (!canvas) {
    throw new Error('Canvas not available');
  }

  const fileName = `joint-analysis-${new Date().toISOString().split('T')[0]}.png`;
  const imageData = canvas.toDataURL('image/png').split(',')[1];
  
  await saveAndShareFile(fileName, imageData, 'image/png');
};
