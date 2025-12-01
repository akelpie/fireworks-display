import * as THREE from 'three';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Night sky background
scene.background = new THREE.Color(0x000000);
camera.position.z = 5;

// Create stars
function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [];

    for (let i = 0; i < 3000; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 2000;
        starVertices.push(x, y, z);
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 1 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

createStars();

// Firework class
class Firework {
    constructor(x, y, color) {
        this.particles = [];
        this.dead = false;

        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = [];

        for (let i = 0; i < particleCount; i++) {
            positions.push(x, y, 0);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.1,
            transparent: true,
            opacity: 1
        });

        this.points = new THREE.Points(geometry, material);
        scene.add(this.points);

        // Create velocity for each particle
        this.velocities = [];
        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = Math.random() * 0.05 + 0.02;

            this.velocities.push({
                x: Math.sin(phi) * Math.cos(theta) * speed,
                y: Math.sin(phi) * Math.sin(theta) * speed,
                z: Math.cos(phi) * speed
            });
        }

        this.age = 0;
        this.maxAge = 120;
    }

    update() {
        this.age++;
        const positions = this.points.geometry.attributes.position.array;

        for (let i = 0; i < this.velocities.length; i++) {
            const idx = i * 3;
            positions[idx] += this.velocities[i].x;
            positions[idx + 1] += this.velocities[i].y;
            positions[idx + 2] += this.velocities[i].z;

            // Gravity
            this.velocities[i].y -= 0.001;
        }

        this.points.geometry.attributes.position.needsUpdate = true;

        // Fade out
        this.points.material.opacity = 1 - (this.age / this.maxAge);

        if (this.age >= this.maxAge) {
            this.dead = true;
            scene.remove(this.points);
            this.points.geometry.dispose();
            this.points.material.dispose();
        }
    }
}

// Fireworks array
const fireworks = [];

function launchFirework() {
    const x = (Math.random() - 0.5) * 8;
    const y = (Math.random() - 0.5) * 4 + 2;
    const color = new THREE.Color(Math.random(), Math.random(), Math.random());

    const firework = new Firework(x, y, color);
    fireworks.push(firework);
}

// Audio setup
let audioContext;
let analyser;
let dataArray;
let audioSource;
let audioElement;
let isPlaying = false;

const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const status = document.getElementById('status');

uploadBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadAudio(file);
    }
});

function loadAudio(file) {
    if (audioElement) {
        audioElement.pause();
        audioElement = null;
    }

    audioElement = new Audio();
    audioElement.src = URL.createObjectURL(file);

    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    if (audioSource) {
        audioSource.disconnect();
    }

    audioSource = audioContext.createMediaElementSource(audioElement);
    audioSource.connect(analyser);
    analyser.connect(audioContext.destination);

    playBtn.disabled = false;
    pauseBtn.disabled = false;
    status.textContent = `Loaded: ${file.name}`;
}

playBtn.addEventListener('click', () => {
    if (audioElement) {
        audioElement.play();
        isPlaying = true;
        status.textContent = 'Playing...';
    }
});

pauseBtn.addEventListener('click', () => {
    if (audioElement) {
        audioElement.pause();
        isPlaying = false;
        status.textContent = 'Paused';
    }
});

// Beat detection
let lastBeatTime = 0;
const beatThreshold = 20; // Lowered threshold
const beatCooldown = 0; // ms between beats
let beatHistory = [];

function detectBeat() {
    if (!analyser || !isPlaying) return false;

    analyser.getByteFrequencyData(dataArray);

    // Calculate average of lower frequencies (bass/kick)
    let sum = 0;
    const bassEnd = Math.floor(dataArray.length * 0.15);
    for (let i = 0; i < bassEnd; i++) {
        sum += dataArray[i];
    }
    const average = sum / bassEnd;

    // Keep history for dynamic threshold
    beatHistory.push(average);
    if (beatHistory.length > 50) {
        beatHistory.shift();
    }

    // Calculate dynamic threshold based on recent history
    const historyAvg = beatHistory.reduce((a, b) => a + b, 0) / beatHistory.length;
    const dynamicThreshold = Math.max(beatThreshold, historyAvg * 1.3);

    const now = Date.now();
    if (average > dynamicThreshold && now - lastBeatTime > beatCooldown) {
        lastBeatTime = now;
        return true;
    }

    return false;
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // Beat detection and debug info
    if (detectBeat()) {
        launchFirework();
        // Visual feedback
        status.textContent = 'BOOM!';
        setTimeout(() => {
            if (isPlaying) status.textContent = 'Playing...';
        }, 100);
    }

    // Also launch fireworks periodically if audio is playing (fallback)
    if (isPlaying && Math.random() < 0.01) { // 1% chance per frame
        launchFirework();
    }

    // Update fireworks
    for (let i = fireworks.length - 1; i >= 0; i--) {
        fireworks[i].update();
        if (fireworks[i].dead) {
            fireworks.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

    animate();
