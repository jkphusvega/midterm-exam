"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx_83cQ1qmx2nmrJV_rj-RGYz2t7dGxuxQwWNrFo6ufv_0tgc7b8ZsbwXyz0DS6nIiCnw/exec';

const COLORS = {
    red: '#ff6b81',    // 연한 빨강 (명확한 코랄/핑크빛 빨강)
    orange: '#ffb86c', // 연한 주황 (귤색 계열)
    yellow: '#f6e58d', // 연한 노랑 (레몬색 계열)
    blue: '#74b9ff',   // 연한 파랑
    green: '#55efc4',  // 연한 녹색
    purple: '#a29bfe'  // 연한 보라
};

const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const TOTAL_BRICKS = BRICK_ROWS * BRICK_COLS;
const RED_BRICK_COUNT = 12;
const PADDING = 4;
const TOP_OFFSET = 40;

type GameState = 'START' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'CLEAR';

export default function Game() {
    const [gameState, setGameState] = useState<GameState>('START');
    const [playerName, setPlayerName] = useState('');
    const [inputName, setInputName] = useState('');
    const [uiState, setUiState] = useState({ lives: 3, score: 0, time: '00:00', targets: 12 });
    const [countdown, setCountdown] = useState<string | number>('');
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [isLoadingRank, setIsLoadingRank] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const reqRef = useRef<number>(0);
    const bgmRef = useRef<HTMLAudioElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);

    // Shared game logic state (mutable)
    const core = useRef({
        lives: 3,
        score: 0,
        redBricks: 0,
        timeStarted: 0,
        pausedStart: 0,
        pausedDuration: 0,
        timerRunning: false,
        timeSeconds: 0,
        state: 'START' as GameState,
        playerName: '',
        scaleX: 1,
        left: false,
        right: false,
        touchX: 0,
        paddle: { w: 80, h: 12, speed: 12, x: 0, y: 0, color: '#ffffff' },
        ball: { r: 6, speed: 8.5, dx: 0, dy: 0, x: 0, y: 0, color: '#ffffff' },
        bricks: [] as any[],
        particles: [] as any[]
    });

    useEffect(() => {
        bgmRef.current = new Audio('/Hyper_Speed_Run.mp3');
        bgmRef.current.loop = true;
        bgmRef.current.volume = 0.3;
        
        const handleResize = () => {
            if (canvasRef.current && containerRef.current) {
                const cvs = canvasRef.current;
                const cont = containerRef.current;
                cvs.width = cont.clientWidth;
                cvs.height = cont.clientHeight;
                core.current.scaleX = cvs.width / cont.clientWidth;
            }
        };
        window.addEventListener('resize', handleResize);
        setTimeout(handleResize, 100); // Give layout time to settle
        
        return () => {
            window.removeEventListener('resize', handleResize);
            if (bgmRef.current) bgmRef.current.pause();
            cancelAnimationFrame(reqRef.current);
        };
    }, []);

    const playHitSound = useCallback(() => {
        if (!audioCtxRef.current) {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.05);
    }, []);

    const syncUI = () => {
        const c = core.current;
        let mins = Math.floor(c.timeSeconds / 60);
        let secs = c.timeSeconds % 60;
        let t = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
        setUiState({ lives: c.lives, score: c.score, time: t, targets: Math.max(0, 3 - c.redBricks) });
    };

    const resetBall = () => {
        const c = core.current;
        const cvs = canvasRef.current;
        if (!cvs) return;
        c.ball.x = c.paddle.x + c.paddle.w / 2;
        c.ball.y = c.paddle.y - c.ball.r - 1;
        const angle = -1 * (Math.random() * 60 + 60);
        const rad = angle * Math.PI / 180;
        c.ball.dx = c.ball.speed * Math.cos(rad);
        c.ball.dy = c.ball.speed * Math.sin(rad);
    };

    const initLevel = () => {
        const c = core.current;
        const cvs = canvasRef.current;
        if (!cvs) return;
        
        c.paddle.x = (cvs.width - c.paddle.w) / 2;
        c.paddle.y = cvs.height - 30 - c.paddle.h;

        const PADDING = 4;
        const BRICK_COLS = 8;
        const BRICK_ROWS = 5;
        const TOTAL_BRICKS = BRICK_COLS * BRICK_ROWS;
        const TOP_OFFSET = 120; // 벽돌 위쪽 여백
        const SIDE_MARGIN = 60; // 양 옆 여백 더 넓게
        
        const brickW = (cvs.width - 2 * SIDE_MARGIN - (BRICK_COLS + 1) * PADDING) / BRICK_COLS;
        const brickH = 20;

        let colors = [];
        for (let i = 0; i < RED_BRICK_COUNT; i++) colors.push(COLORS.red);
        const others = [COLORS.orange, COLORS.yellow, COLORS.blue, COLORS.green, COLORS.purple];
        for (let i = 0; i < TOTAL_BRICKS - RED_BRICK_COUNT; i++) {
            colors.push(others[Math.floor(Math.random() * others.length)]);
        }
        for (let i = colors.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [colors[i], colors[j]] = [colors[j], colors[i]];
        }

        c.bricks = [];
        let idx = 0;
        for (let r = 0; r < BRICK_ROWS; r++) {
            for (let col = 0; col < BRICK_COLS; col++) {
                c.bricks.push({
                    x: SIDE_MARGIN + PADDING + col * (brickW + PADDING),
                    y: TOP_OFFSET + r * (brickH + PADDING),
                    w: brickW,
                    h: brickH,
                    color: colors[idx++],
                    alive: true
                });
            }
        }
        resetBall();
    };

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const missionFailed = () => {
        core.current.state = 'GAME_OVER';
        core.current.timerRunning = false;
        setGameState('GAME_OVER');
        if (bgmRef.current) bgmRef.current.pause();
    };

    const missionComplete = async () => {
        core.current.state = 'CLEAR';
        core.current.timerRunning = false;
        setGameState('CLEAR');
        if (bgmRef.current) bgmRef.current.pause();
        
        const cvs = canvasRef.current;
        if(cvs) {
            core.current.particles = Array.from({length: 150}).map(() => ({
                x: cvs.width / 2, y: cvs.height / 2,
                dx: (Math.random() - 0.5) * 12, dy: (Math.random() - 0.5) * 12 - 5,
                color: `hsl(${Math.random() * 360}, 100%, 60%)`,
                size: Math.random() * 3 + 2, life: Math.random() * 60 + 60,
                gravity: 0.05, alpha: 1.0
            }));
        }

        let mins = Math.floor(core.current.timeSeconds / 60);
        let secs = core.current.timeSeconds % 60;
        let t = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
        
        try {
            setIsLoadingRank(true);
            const params = new URLSearchParams({
                action: 'save',
                name: core.current.playerName,
                timeSeconds: core.current.timeSeconds.toString(),
                timeFormatted: t
            });
            const res = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`);
            const text = await res.text();
            
            try {
                const data = JSON.parse(text);
                if (Array.isArray(data)) {
                    const formattedData = data.slice(0, 3).map((l: any) => {
                        let finalTime = l.time;
                        if (l.seconds !== undefined) {
                            const m = Math.floor(l.seconds / 60).toString().padStart(2, '0');
                            const s = (l.seconds % 60).toString().padStart(2, '0');
                            finalTime = `${m}:${s}`;
                        } else if (typeof l.time === 'string' && l.time.includes('T')) {
                            const date = new Date(l.time);
                            const min = date.getMinutes().toString().padStart(2, '0');
                            finalTime = `00:${min}`;
                        }
                        return { ...l, time: finalTime };
                    });
                    setLeaderboard(formattedData);
                } else if (data.error) {
                    alert("구글 시트 에러: " + data.error);
                }
            } catch(err) {
                alert("응답 파싱 에러 (권한 문제일 수 있습니다): " + text.substring(0, 100));
                console.error("Parse Error:", err, text);
            }
        } catch(e: any) {
            alert("네트워크 에러: " + e.message);
            console.error(e);
        } finally {
            setIsLoadingRank(false);
        }
    };

    const gameLoop = useCallback(() => {
        const c = core.current;
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;

        if (c.state === 'PLAYING' || c.state === 'COUNTDOWN') {
            if (c.timerRunning) {
                let elapsed = Date.now() - c.timeStarted - c.pausedDuration;
                c.timeSeconds = Math.floor(elapsed / 1000);
            }

            if (c.left) c.paddle.x -= c.paddle.speed;
            if (c.right) c.paddle.x += c.paddle.speed;
            c.paddle.x = clamp(c.paddle.x, 0, cvs.width - c.paddle.w);

            if (c.state === 'PLAYING') {
                c.ball.x += c.ball.dx;
                c.ball.y += c.ball.dy;

                if (c.ball.x - c.ball.r <= 0) { c.ball.x = c.ball.r; c.ball.dx *= -1; }
                if (c.ball.x + c.ball.r >= cvs.width) { c.ball.x = cvs.width - c.ball.r; c.ball.dx *= -1; }
                if (c.ball.y - c.ball.r <= 0) { c.ball.y = c.ball.r; c.ball.dy *= -1; }

                if (c.ball.y + c.ball.r >= cvs.height) {
                    c.lives -= 1;
                    if (c.lives <= 0) {
                        missionFailed();
                    } else {
                        resetBall();
                        c.state = 'COUNTDOWN';
                        setGameState('COUNTDOWN');
                        setCountdown('READY?');
                        setTimeout(() => {
                            if (core.current.state === 'COUNTDOWN') {
                                core.current.state = 'PLAYING';
                                setGameState('PLAYING');
                            }
                        }, 1000);
                    }
                }

                if (c.ball.dy > 0 &&
                    c.ball.y + c.ball.r >= c.paddle.y && c.ball.y - c.ball.r <= c.paddle.y + c.paddle.h &&
                    c.ball.x + c.ball.r >= c.paddle.x && c.ball.x - c.ball.r <= c.paddle.x + c.paddle.w) {
                    
                    c.ball.y = c.paddle.y - c.ball.r;
                    let hp = (c.ball.x - c.paddle.x) / c.paddle.w;
                    let angle = clamp(hp, 0, 1) * 150 - 75;
                    let rad = angle * Math.PI / 180;
                    c.ball.dx = c.ball.speed * Math.sin(rad);
                    c.ball.dy = -c.ball.speed * Math.cos(rad);
                    playHitSound();
                }

                for (let b of c.bricks) {
                    if (!b.alive) continue;
                    let tx = c.ball.x, ty = c.ball.y;
                    if (c.ball.x < b.x) tx = b.x; else if (c.ball.x > b.x + b.w) tx = b.x + b.w;
                    if (c.ball.y < b.y) ty = b.y; else if (c.ball.y > b.y + b.h) ty = b.y + b.h;
                    
                    let dx = c.ball.x - tx, dy = c.ball.y - ty;
                    let dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist <= c.ball.r) {
                        b.alive = false;
                        c.score += 100;
                        playHitSound();
                        if (b.color === COLORS.red) {
                            c.redBricks++;
                            if (c.redBricks >= 3) {
                                missionComplete();
                            }
                        }
                        if (Math.abs(dx) > Math.abs(dy)) c.ball.dx *= -1;
                        else c.ball.dy *= -1;
                        break;
                    }
                }
            }

            syncUI();
        } else if (c.state === 'CLEAR') {
            for (let i = c.particles.length - 1; i >= 0; i--) {
                let p = c.particles[i];
                p.x += p.dx; p.y += p.dy; p.dy += p.gravity;
                p.life--; p.alpha = Math.max(0, p.life / 100);
                if (p.life <= 0) c.particles.splice(i, 1);
            }
        }

        ctx.clearRect(0, 0, cvs.width, cvs.height);

        for (let b of c.bricks) {
            if (b.alive) {
                ctx.fillStyle = b.color;
                ctx.beginPath();
                ctx.roundRect(b.x, b.y, b.w, b.h, 4);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fillRect(b.x, b.y, b.w, 4); 
            }
        }

        ctx.fillStyle = c.paddle.color;
        ctx.shadowColor = 'rgba(255,255,255,0.5)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(c.paddle.x, c.paddle.y, c.paddle.w, c.paddle.h, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = c.ball.color;
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(c.ball.x, c.ball.y, c.ball.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (c.state === 'CLEAR') {
            for (let p of c.particles) {
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }

        reqRef.current = requestAnimationFrame(gameLoop);
    }, [playHitSound]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') core.current.left = true;
            if (e.key === 'ArrowRight') core.current.right = true;
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') core.current.left = false;
            if (e.key === 'ArrowRight') core.current.right = false;
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const handleTouchStart = (e: React.TouchEvent) => {
        if(e.touches.length > 0) {
            core.current.touchX = e.touches[0].clientX * core.current.scaleX;
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (core.current.state !== 'PLAYING') return;
        if(e.touches.length > 0) {
            const tx = e.touches[0].clientX * core.current.scaleX;
            const diff = tx - core.current.touchX;
            core.current.paddle.x += diff * 1.2;
            core.current.touchX = tx;
        }
    };

    const startGame = () => {
        if (!inputName.trim()) { alert('이름을 입력하세요'); return; }
        setPlayerName(inputName.trim());
        
        const c = core.current;
        c.playerName = inputName.trim();
        c.lives = 3; c.score = 0; c.redBricks = 0; c.pausedDuration = 0; c.timeSeconds = 0;
        
        if (canvasRef.current && containerRef.current) {
            canvasRef.current.width = containerRef.current.clientWidth;
            canvasRef.current.height = containerRef.current.clientHeight;
        }

        initLevel();
        
        setGameState('COUNTDOWN');
        c.state = 'COUNTDOWN';
        
        let cnt = 3;
        setCountdown(cnt.toString());
        
        const iv = setInterval(() => {
            cnt--;
            if (cnt > 0) setCountdown(cnt.toString());
            else if (cnt === 0) setCountdown('START!');
            else {
                clearInterval(iv);
                if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
                if (bgmRef.current) { bgmRef.current.currentTime = 0; bgmRef.current.play().catch(()=>{}); }
                
                c.state = 'PLAYING';
                setGameState('PLAYING');
                c.timeStarted = Date.now();
                c.timerRunning = true;
            }
        }, 1000);
        
        cancelAnimationFrame(reqRef.current);
        reqRef.current = requestAnimationFrame(gameLoop);
    };

    const togglePause = () => {
        const c = core.current;
        if (c.state === 'PLAYING') {
            c.state = 'PAUSED';
            setGameState('PAUSED');
            c.timerRunning = false;
            c.pausedStart = Date.now();
            if(bgmRef.current) bgmRef.current.pause();
        } else if (c.state === 'PAUSED') {
            c.state = 'PLAYING';
            setGameState('PLAYING');
            c.timerRunning = true;
            c.pausedDuration += Date.now() - c.pausedStart;
            if(bgmRef.current) bgmRef.current.play();
        }
    };

    const exitToMain = () => {
        core.current.state = 'START';
        setGameState('START');
        if(bgmRef.current) bgmRef.current.pause();
    };

    return (
        <div className="layout-container">
            <div id="game-wrapper" ref={containerRef}>
                <canvas 
                    ref={canvasRef} 
                    onTouchStart={handleTouchStart} 
                    onTouchMove={handleTouchMove}
                />

                {gameState === 'COUNTDOWN' && (
                    <div className="countdown">{countdown}</div>
                )}

                {gameState === 'START' && (
                    <div className="glass-screen">
                        <h1 className="title">INU 벽돌깨기</h1>
                        <div className="mascot-container">
                            <img src="/Mascot.jpg" alt="Mascot" />
                        </div>
                        <input 
                            className="glass-input" 
                            placeholder="이름을 입력하세요" 
                            maxLength={10}
                            value={inputName}
                            onChange={(e) => setInputName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && startGame()}
                        />
                        <button className="btn-primary" onClick={startGame}>게임 시작</button>
                        <div className="credits">
                            국어국문학과 202402788 김종경
                        </div>
                    </div>
                )}

                {gameState === 'GAME_OVER' && (
                    <div className="glass-screen">
                        <h1 className="result-title fail">미션 실패!</h1>
                        <button className="btn-primary" style={{marginTop: '2rem'}} onClick={exitToMain}>다시 시작</button>
                    </div>
                )}

                {gameState === 'CLEAR' && (
                    <div className="glass-screen">
                        <h1 className="result-title success">미션 성공!</h1>
                        <h2 style={{color: '#cbd5e1', fontSize: '1.5rem', marginBottom: '1rem'}}>완료 시간: {uiState.time}</h2>
                        
                        <div className="leaderboard-card">
                            <h3 className="leaderboard-title">🏆 TOP 3 LEADERBOARD</h3>
                            <div className="rank-list">
                                {isLoadingRank ? (
                                    <div className="loading-container">
                                        <div className="loading-spinner"></div>
                                        <div className="loading-text" style={{padding:0}}>기록을 저장하고 불러오는 중...</div>
                                    </div>
                                ) : leaderboard.length > 0 ? leaderboard.map((l, i) => (
                                    <div key={i} className={`rank-item ${i === 0 ? 'first' : ''}`}>
                                        <span className="rank-name">
                                            {i === 0 ? '🏆 1.' : `${i + 1}.`} {l.name}
                                        </span>
                                        <span className="rank-time">{l.time}</span>
                                    </div>
                                )) : <div className="loading-text">기록이 없습니다.</div>}
                            </div>
                        </div>

                        <button className="btn-primary" onClick={exitToMain}>다시 시작</button>
                    </div>
                )}
            </div>

            <div className="sidebar">
                <div className="info-card">
                    <div className="info-label">PLAYER</div>
                    <div className="info-value">{playerName || '-'}</div>
                </div>
                <div className="info-card">
                    <div className="info-label">LIVES</div>
                    <div className="info-value">{'❤️'.repeat(uiState.lives) || '💀'}</div>
                </div>
                <div className="info-card">
                    <div className="info-label">TIME</div>
                    <div className="info-value">{uiState.time}</div>
                </div>
                <div className="info-card">
                    <div className="info-label">SCORE</div>
                    <div className="info-value">{uiState.score}</div>
                </div>
                <div className="info-card">
                    <div className="info-label">TARGETS</div>
                    <div className="info-value" style={{color: COLORS.red}}>{uiState.targets}</div>
                </div>

                <div className="controls-group">
                    <button className="btn-sidebar" onClick={togglePause} disabled={gameState !== 'PLAYING' && gameState !== 'PAUSED'}>
                        {gameState === 'PAUSED' ? '▶ 계속하기' : '⏸ 일시정지'}
                    </button>
                    <button className="btn-sidebar" onClick={exitToMain}>🔄 다시 시작</button>
                    <button className="btn-sidebar danger" onClick={missionFailed} disabled={gameState !== 'PLAYING' && gameState !== 'PAUSED'}>게임 종료</button>
                </div>
            </div>
        </div>
    );
}
