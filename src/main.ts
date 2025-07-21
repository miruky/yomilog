import './style.css';
import { mountApp } from './app';
import { ReadingLog } from './lib/log';

const root = document.getElementById('app');
if (root !== null) {
  mountApp(root, new ReadingLog(localStorage));
}
