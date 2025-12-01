import * as THREE from 'three';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Night sky background
scene.background = new THREE.Color(0x000033);
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

// Firework class with variable speed/size
class Firework {
    constructor(x, y, color, intensity = 1, speed = 1) {
        this.particles = [];
        this.dead = false;

        const particleCount = Math.floor(80 + intensity * 60); // More particles for louder sounds
        const geometry = new THREE.BufferGeometry();
        const positions = [];

        for (let i = 0; i < particleCount; i++) {
            positions.push(x, y, 0);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

        const material = new THREE.PointsMaterial({
            color: color,
            size: 0.08 + intensity * 0.05,
            transparent: true,
            opacity: 1
        });

        this.points = new THREE.Points(geometry, material);
        scene.add(this.points);

        // Create velocity for each particle - speed affects explosion size
        this.velocities = [];
        const baseSpeed = 0.02 * speed;
        for (let i = 0; i < particleCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const particleSpeed = baseSpeed + Math.random() * baseSpeed * 0.5;

            this.velocities.push({
                x: Math.sin(phi) * Math.cos(theta) * particleSpeed,
                y: Math.sin(phi) * Math.sin(theta) * particleSpeed,
                z: Math.cos(phi) * particleSpeed
            });
        }

        this.age = 0;
        // Longer duration for slower/sustained notes
        this.maxAge = Math.floor(80 + (1 / speed) * 40);
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
            this.velocities[i].y -= 0.0008;
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

function launchFirework(intensity = 1, speed = 1, frequencyBand = 0.5) {
    const x = (Math.random() - 0.5) * 8;
    const y = (Math.random() - 0.5) * 4 + 2;

    // Color based on frequency band (low = red, mid = green, high = blue)
    let color;
    if (frequencyBand < 0.33) {
        // Low frequencies - warm colors
        color = new THREE.Color(1, Math.random() * 0.5, Math.random() * 0.3);
    } else if (frequencyBand < 0.66) {
        // Mid frequencies - varied colors
        color = new THREE.Color(Math.random(), Math.random() * 0.8 + 0.2, Math.random());
    } else {
        // High frequencies - cool colors
        color = new THREE.Color(Math.random() * 0.3, Math.random() * 0.5 + 0.5, 1);
    }

    const firework = new Firework(x, y, color, intensity, speed);
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
        analyser.fftSize = 2048; // Higher resolution for better note detection
        analyser.smoothingTimeConstant = 0.6;
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

// Advanced onset detection with frequency bands
let energyHistory = [];
let lastOnsetTimes = {}; // Track per-band cooldowns
const onsetCooldown = 80; // Minimum time between onsets per band in ms
const historySize = 10; // Frames to keep for averaging

function detectOnsets() {
    if (!analyser || !isPlaying) return [];

    analyser.getByteFrequencyData(dataArray);

    const onsets = [];
    const numBands = 8; // More bands for better note detection
    const bandSize = Math.floor(dataArray.length / numBands);

    // Calculate current energy for all bands
    const currentBandEnergies = [];
    for (let band = 0; band < numBands; band++) {
        const start = band * bandSize;
        const end = start + bandSize;

        let energy = 0;
        for (let i = start; i < end; i++) {
            energy += dataArray[i];
        }
        energy = energy / bandSize; // Average energy
        currentBandEnergies.push(energy);
    }

    // Add to history
    energyHistory.push(currentBandEnergies);
    if (energyHistory.length > historySize) {
        energyHistory.shift();
    }

    // Need at least a few frames of history
    if (energyHistory.length < 3) {
        return [];
    }

    const now = Date.now();

    // Check each band for onsets
    for (let band = 0; band < numBands; band++) {
        // Check cooldown for this specific band
        if (lastOnsetTimes[band] && now - lastOnsetTimes[band] < onsetCooldown) {
            continue;
        }

        const currentEnergy = currentBandEnergies[band];

        // Calculate average energy for this band over history
        let avgEnergy = 0;
        for (let i = 0; i < energyHistory.length - 1; i++) { // Exclude current frame
            avgEnergy += energyHistory[i][band];
        }
        avgEnergy = avgEnergy / (energyHistory.length - 1);

        // Calculate variance for adaptive threshold
        let variance = 0;
        for (let i = 0; i < energyHistory.length - 1; i++) {
            const diff = energyHistory[i][band] - avgEnergy;
            variance += diff * diff;
        }
        variance = Math.sqrt(variance / (energyHistory.length - 1));

        // Onset detection: current energy significantly exceeds recent average
        const threshold = avgEnergy + Math.max(8, variance * 1.5);
        const energyIncrease = currentEnergy - avgEnergy;

        if (currentEnergy > threshold && energyIncrease > 5 && currentEnergy > 20) {
            // Calculate speed based on how sudden the onset is
            const speed = Math.min(2.5, 0.8 + (energyIncrease / 30));
            // Intensity based on overall volume
            const intensity = Math.min(1.5, currentEnergy / 80);
            // Frequency band position (0 to 1)
            const freqPosition = band / numBands;

            onsets.push({
                intensity: intensity,
                speed: speed,
                frequencyBand: freqPosition,
                band: band
            });

            lastOnsetTimes[band] = now;
        }
    }

    return onsets;
}

// Animation loop
let fireworkCounter = 0;

function animate() {
    requestAnimationFrame(animate);

    // Detect onsets and launch fireworks
    if (isPlaying) {
        const onsets = detectOnsets();

        if (onsets.length > 0) {
            // Launch firework for each detected onset (up to 3 per frame to avoid overwhelming)
            const maxFireworks = Math.min(3, onsets.length);
            for (let i = 0; i < maxFireworks; i++) {
                const onset = onsets[i];
                launchFirework(onset.intensity, onset.speed, onset.frequencyBand);
                fireworkCounter++;
            }

            // Visual feedback
            status.textContent = `🎆 Playing... (${fireworkCounter} fireworks)`;
        }
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