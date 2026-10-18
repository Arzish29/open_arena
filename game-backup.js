const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const voiceLevel = document.getElementById("voiceLevel");
const voiceText = document.getElementById("voiceText");
const micStatus = document.getElementById("micStatus");
const welcome = document.getElementById("welcome");
const gameOver = document.getElementById("gameOver");

let W = 900;
let H = 500;
let running = false;
let started = false;
let score = 0;
let best = Number(localStorage.getItem("screamLeapBest") || 0);
let cameraX = 0;
let frame = 0;
let microphoneEnabled = false;
let audioContext = null;
let analyser = null;
let microphoneStream = null;
let lastVoiceJump = 0;
let voiceVolume = 0;

bestEl.textContent = best;

const chicken = {
    x: 130,
    y: 200,
    radius: 22,
    vy: 0,
    grounded: false,
    rotation: 0
};

const gravity = 0.48;
const platforms = [];
const eggs = [];
const obstacles = [];

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    W = Math.max(320, rect.width);
    H = Math.max(240, rect.height);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!started) {
        chicken.y = H * 0.55;
    }
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function groundY() {
    return H - 65;
}

function resetWorld() {
    cameraX = 0;
    frame = 0;
    score = 0;
    scoreEl.textContent = "0";

    chicken.x = 130;
    chicken.y = groundY() - 28;
    chicken.vy = 0;
    chicken.grounded = true;
    chicken.rotation = 0;

    platforms.length = 0;
    eggs.length = 0;
    obstacles.length = 0;

    platforms.push({ x: 0, y: groundY(), w: 700, h: 100 });
    platforms.push({ x: 800, y: groundY() - 80, w: 190, h: 18 });
    platforms.push({ x: 1110, y: groundY() - 25, w: 200, h: 18 });
    platforms.push({ x: 1450, y: groundY() - 100, w: 200, h: 18 });
    platforms.push({ x: 1770, y: groundY() - 30, w: 220, h: 18 });

    eggs.push({ x: 400, y: groundY() - 80, collected: false });
    eggs.push({ x: 870, y: groundY() - 125, collected: false });
    eggs.push({ x: 1180, y: groundY() - 75, collected: false });
    eggs.push({ x: 1510, y: groundY() - 145, collected: false });
    eggs.push({ x: 1850, y: groundY() - 75, collected: false });

    obstacles.push({ x: 540, y: groundY() - 30, w: 30, h: 30 });
    obstacles.push({ x: 1010, y: groundY() - 30, w: 30, h: 30 });
    obstacles.push({ x: 1350, y: groundY() - 30, w: 30, h: 30 });
    obstacles.push({ x: 1680, y: groundY() - 30, w: 30, h: 30 });
}

function drawCloud(x, y, size) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(x, y, size * 0.45, 0, Math.PI * 2);
    ctx.arc(x + size * 0.42, y - size * 0.2, size * 0.58, 0, Math.PI * 2);
    ctx.arc(x + size * 0.9, y, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
}

function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#55c9f5");
    sky.addColorStop(0.7, "#c7f1ff");
    sky.addColorStop(1, "#fff2bf");

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#ffe77a";
    ctx.beginPath();
    ctx.arc(W - 100, 85, 38, 0, Math.PI * 2);
    ctx.fill();

    drawCloud((W * 0.18 - cameraX * 0.12) % (W + 200), 95, 45);
    drawCloud((W * 0.62 - cameraX * 0.08) % (W + 250), 155, 35);
    drawCloud((W * 0.9 - cameraX * 0.1 + W) % (W + 250), 65, 30);

    ctx.fillStyle = "#9bdf9b";
    ctx.beginPath();
    ctx.moveTo(0, H - 105);
    for (let x = 0; x <= W + 40; x += 40) {
        ctx.lineTo(x, H - 110 - Math.sin((x + cameraX * 0.18) / 100) * 25);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#72c76d";
    ctx.beginPath();
    ctx.moveTo(0, H - 70);
    for (let x = 0; x <= W + 40; x += 40) {
        ctx.lineTo(x, H - 80 - Math.sin((x + cameraX * 0.3) / 130) * 20);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
}

function drawPlatform(p) {
    const x = p.x - cameraX;
    if (x + p.w < -50 || x > W + 50) return;

    ctx.fillStyle = "#9b5a2e";
    ctx.fillRect(x, p.y, p.w, p.h);

    ctx.fillStyle = "#58bd58";
    ctx.fillRect(x, p.y, p.w, 10);

    ctx.fillStyle = "#c17b43";
    for (let i = 12; i < p.w; i += 35) {
        ctx.fillRect(x + i, p.y + 20, 15, 7);
    }
}

function drawEgg(e) {
    if (e.collected) return;

    const x = e.x - cameraX;
    if (x < -30 || x > W + 30) return;

    ctx.save();
    ctx.translate(x, e.y + Math.sin(frame * 0.08 + e.x) * 3);
    ctx.rotate(-0.15);

    ctx.fillStyle = "#fff7b0";
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#e9a928";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#ffcf36";
    ctx.beginPath();
    ctx.arc(-3, -5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawObstacle(o) {
    const x = o.x - cameraX;
    if (x + o.w < -30 || x > W + 30) return;

    ctx.fillStyle = "#e94f52";
    ctx.beginPath();
    ctx.moveTo(x, o.y + o.h);
    ctx.lineTo(x + o.w / 2, o.y);
    ctx.lineTo(x + o.w, o.y + o.h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#a92535";
    ctx.lineWidth = 3;
    ctx.stroke();
}

function drawChicken() {
    ctx.save();
    ctx.translate(chicken.x, chicken.y);
    ctx.rotate(chicken.rotation);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(0, 26, 25, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = "#fffaf0";
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 23, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Wing
    ctx.fillStyle = "#f2dfb4";
    ctx.beginPath();
    ctx.ellipse(-7, 5, 10, 8, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Comb
    ctx.fillStyle = "#ef4e55";
    ctx.beginPath();
    ctx.arc(-8, -22, 7, 0, Math.PI * 2);
    ctx.arc(1, -25, 7, 0, Math.PI * 2);
    ctx.arc(9, -20, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eye
    ctx.fillStyle = "#222";
    ctx.beginPath();
    ctx.arc(9, -5, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = "#ff9f2e";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(31, 5);
    ctx.lineTo(18, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Feet
    ctx.strokeStyle = "#f08c28";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, 21);
    ctx.lineTo(-8, 29);
    ctx.lineTo(-14, 31);
    ctx.moveTo(-8, 29);
    ctx.lineTo(-2, 31);
    ctx.moveTo(8, 21);
    ctx.lineTo(8, 29);
    ctx.lineTo(2, 31);
    ctx.moveTo(8, 29);
    ctx.lineTo(14, 31);
    ctx.stroke();

    ctx.restore();
}

function jump(power = 12) {
    if (!running || !chicken.grounded) return;

    chicken.vy = -power;
    chicken.grounded = false;
}

function addWorld() {
    const farthest = platforms.length
        ? Math.max(...platforms.map(p => p.x + p.w))
        : cameraX + W;

    if (farthest < cameraX + W + 500) {
        const x = farthest + 70 + Math.random() * 80;
        const y = groundY() - Math.random() * 100;

        platforms.push({ x, y, w: 150 + Math.random() * 100, h: 100 });

        if (Math.random() > 0.25) {
            eggs.push({ x: x + 55, y: y - 45, collected: false });
        }

        if (Math.random() > 0.35) {
            obstacles.push({
                x: x + 100,
                y: y - 30,
                w: 28,
                h: 30
            });
        }
    }
}

function endGame() {
    running = false;
    document.getElementById("finalScore").textContent = score;
    gameOver.classList.remove("hidden");
}

function update() {
    if (!running) return;

    frame++;

    // Move forward automatically.
    cameraX += 2.3;
    chicken.x = cameraX + 130;

    chicken.vy += gravity;
    chicken.y += chicken.vy;
    chicken.grounded = false;

    const previousBottom = chicken.y - chicken.vy + chicken.radius;

    for (const p of platforms) {
        if (
            chicken.x + 14 > p.x &&
            chicken.x - 14 < p.x + p.w &&
            previousBottom <= p.y + 5 &&
            chicken.y + chicken.radius >= p.y &&
            chicken.vy >= 0
        ) {
            chicken.y = p.y - chicken.radius;
            chicken.vy = 0;
            chicken.grounded = true;
        }
    }

    chicken.rotation = Math.max(-0.35, Math.min(0.35, chicken.vy * 0.025));

    for (const e of eggs) {
        if (!e.collected &&
            Math.abs(chicken.x - e.x) < 30 &&
            Math.abs(chicken.y - e.y) < 32) {
            e.collected = true;
            score += 10;
            scoreEl.textContent = score;
        }
    }

    for (const o of obstacles) {
        if (
            chicken.x + 16 > o.x &&
            chicken.x - 16 < o.x + o.w &&
            chicken.y + 18 > o.y &&
            chicken.y - 18 < o.y + o.h
        ) {
            endGame();
            return;
        }
    }

    // Falling below the screen ends the run.
    if (chicken.y > H + 60) {
        endGame();
        return;
    }

    // Keep the world bounded in memory.
    while (platforms.length && platforms[0].x + platforms[0].w < cameraX - 200) {
        platforms.shift();
    }
    while (eggs.length && eggs[0].x < cameraX - 100) eggs.shift();
    while (obstacles.length && obstacles[0].x < cameraX - 100) obstacles.shift();

    addWorld();
}

function draw() {
    drawBackground();

    for (const p of platforms) drawPlatform(p);
    for (const e of eggs) drawEgg(e);
    for (const o of obstacles) drawObstacle(o);

    drawChicken();

    if (running) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "bold 14px Arial";
        ctx.fillText("SCORE " + score, 20, 28);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function startGame() {
    resetWorld();
    started = true;
    running = true;
    welcome.classList.add("hidden");
    gameOver.classList.add("hidden");
}

document.getElementById("startButton").addEventListener("click", startGame);
document.getElementById("restartButton").addEventListener("click", startGame);
document.getElementById("jumpButton").addEventListener("click", () => jump(12));

document.getElementById("fullscreenButton").addEventListener("click", async () => {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else {
            await document.exitFullscreen();
        }
    } catch (error) {
        console.error("Fullscreen unavailable:", error);
    }
});

window.addEventListener("keydown", event => {
    if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        jump(12);
    }
});

async function enableMicrophone() {
    try {
        microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const source = audioContext.createMediaStreamSource(microphoneStream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        microphoneEnabled = true;
        micStatus.textContent = "Microphone enabled! Speak to jump.";
        voiceText.textContent = "Listening for your voice...";
        document.getElementById("micButton").textContent = "🎙 MICROPHONE ON";

        monitorVoice();
    } catch (error) {
        micStatus.textContent = "Microphone blocked. Allow it in browser settings.";
        voiceText.textContent = "Microphone permission needed";
        console.error("Microphone error:", error);
    }
}

document.getElementById("micButton").addEventListener("click", enableMicrophone);

function monitorVoice() {
    if (!microphoneEnabled || !analyser) return;

    const samples = new Uint8Array(analyser.fftSize);

    function readSound() {
        if (!microphoneEnabled || !analyser) return;

        analyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (const sample of samples) {
            const value = (sample - 128) / 128;
            sum += value * value;
        }

        voiceVolume = Math.sqrt(sum / samples.length);
        const percentage = Math.min(100, voiceVolume * 450);
        voiceLevel.style.width = percentage + "%";

        if (voiceVolume > 0.015) {
            voiceText.textContent = "Voice detected! Power: " + Math.round(percentage) + "%";
        } else {
            voiceText.textContent = "Make some noise to jump!";
        }

        const now = performance.now();

        if (
            running &&
            voiceVolume > 0.045 &&
            chicken.grounded &&
            now - lastVoiceJump > 400
        ) {
            const power = Math.min(22, 10 + voiceVolume * 100);
            jump(power);
            lastVoiceJump = now;
        }

        requestAnimationFrame(readSound);
    }

    readSound();
}

resetWorld();
draw();
gameLoop();
