
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isGenerating: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isGenerating }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configuration
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Adjust canvas size for retina displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const draw = () => {
      if (!isGenerating) {
        // Clear canvas if stopped
        ctx.clearRect(0, 0, rect.width, rect.height);
        
        // Draw idle line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)'; // Indigo-500 low opacity
        ctx.lineWidth = 2;
        ctx.moveTo(0, rect.height / 2);
        ctx.lineTo(rect.width, rect.height / 2);
        ctx.stroke();
        
        return;
      }

      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, rect.width, rect.height);

      const barWidth = (rect.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * rect.height;
        
        // Gradient color
        const gradient = ctx.createLinearGradient(0, rect.height - barHeight, 0, rect.height);
        gradient.addColorStop(0, '#818cf8'); // Indigo-400
        gradient.addColorStop(1, '#6366f1'); // Indigo-500

        ctx.fillStyle = gradient;
        
        // Draw rounded bars
        const radius = 2;
        ctx.beginPath();
        ctx.roundRect(x, rect.height - barHeight, barWidth, barHeight, [radius, radius, 0, 0]);
        ctx.fill();

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isGenerating]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-16 rounded-lg opacity-80"
      style={{ width: '100%', height: '64px' }}
    />
  );
};

export default AudioVisualizer;
