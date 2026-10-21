import { bootApp } from './app/app';
import './style.css';

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
const errorBox = document.getElementById('error');

function showFatal(message: string) {
  if (errorBox) {
    errorBox.hidden = false;
    errorBox.textContent = message;
  }
  const loading = document.getElementById('loading');
  if (loading) loading.hidden = true;
}

function webgl2Available(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2'));
  } catch {
    return false;
  }
}

if (!canvas) showFatal('Scene canvas missing.');
else if (!webgl2Available()) showFatal('WebGL 2 is not available in this browser, so the 3D scene cannot be shown.');
else bootApp(canvas);
