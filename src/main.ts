import { mount } from 'svelte';
import App from './ui/App.svelte';
import './app.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

export default mount(App, { target });
