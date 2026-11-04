// Standalone entry for UI screenshots (built by a scratch config; not shipped).
import './style.css';
import { runHarness } from './harness';

if ('ontouchstart' in window || new URLSearchParams(location.search).has('touch')) document.documentElement.classList.add('touch');
void runHarness().then(() => document.getElementById('boot')?.remove());
