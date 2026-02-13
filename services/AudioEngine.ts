
/**
 * AudioEngine
 * Manages the Web Audio API Context, scheduling, and buffering.
 * Designed for gapless playback of sequential chunks.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlaying: boolean = false;
  private queue: Map<string, AudioBuffer> = new Map();
  private scheduledSources: Map<string, AudioBufferSourceNode> = new Map();
  
  // Callbacks
  public onChunkStart: ((id: string) => void) | null = null;
  public onChunkEnd: ((id: string) => void) | null = null;
  public onPlaybackComplete: (() => void) | null = null;

  constructor() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass({ sampleRate: 24000 });
      }
    } catch (e) {
      console.error("Failed to initialize AudioContext:", e);
      // We don't throw here to avoid crashing the whole app render cycle
    }
  }

  public async init() {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
    } catch (e) {
      console.error("Failed to resume AudioContext:", e);
    }
  }

  public enqueue(id: string, data: Float32Array) {
    if (!this.ctx) return;
    const buffer = this.ctx.createBuffer(1, data.length, 24000);
    buffer.getChannelData(0).set(data);
    this.queue.set(id, buffer);
  }

  public has(id: string): boolean {
    return this.queue.has(id);
  }

  /**
   * Main scheduling loop. 
   * It looks at the provided ID, checks if it's buffered, and schedules it.
   */
  public schedule(id: string): boolean {
    if (!this.ctx || !this.queue.has(id)) return false;

    // 1. Safety check for AudioContext time
    if (this.nextStartTime < this.ctx.currentTime) {
      this.nextStartTime = this.ctx.currentTime + 0.1; // 100ms buffer if we fell behind
    }

    const buffer = this.queue.get(id)!;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    
    source.start(this.nextStartTime);
    
    // Store reference to stop it later if needed
    this.scheduledSources.set(id, source);

    // Event hooks
    // We use setTimeout to trigger UI updates roughly when audio starts/ends
    // This is not sample-accurate but good enough for UI highlighting
    const delayUntilStart = (this.nextStartTime - this.ctx.currentTime) * 1000;
    const durationMs = buffer.duration * 1000;

    const startTimer = window.setTimeout(() => {
       if (this.onChunkStart) this.onChunkStart(id);
    }, delayUntilStart);

    const endTimer = window.setTimeout(() => {
       // Clean up source reference
       this.scheduledSources.delete(id);
       if (this.onChunkEnd) this.onChunkEnd(id);
    }, delayUntilStart + durationMs);

    // Attach timers to source so we can clear them on stop
    (source as any).__timers = [startTimer, endTimer];

    // Advance time cursor
    this.nextStartTime += buffer.duration;
    
    return true;
  }

  public pause() {
    if (this.ctx) this.ctx.suspend();
    this.isPlaying = false;
  }

  public resume() {
    if (this.ctx) this.ctx.resume();
    this.isPlaying = true;
  }

  public stop() {
    if (!this.ctx) return;
    
    // Stop all scheduled nodes
    this.scheduledSources.forEach((source) => {
      try { source.stop(); } catch(e) {}
      // Clear UI timers associated with this source
      if ((source as any).__timers) {
        (source as any).__timers.forEach((t: number) => clearTimeout(t));
      }
    });
    this.scheduledSources.clear();
    
    // Reset cursor
    this.nextStartTime = 0;
    this.isPlaying = false;
    
    // We do NOT clear the queue here, allowing resume/seek strategies if implemented later.
    // But for a hard stop, we might want to reset the pointer in the consumer.
  }

  public prune(playedIds: string[]) {
    playedIds.forEach(id => this.queue.delete(id));
  }

  public clearQueue() {
    this.queue.clear();
  }
}
