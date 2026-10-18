import * as Tone from "tone";
import type { RhythmPattern, TrackId } from "../lib/types";

export interface PlaybackOptions {
  /** The current sixteenth note, or -1 when playback has stopped. */
  onStep?: (step: number) => void;
  /** Beats 1–4 during the count-in; null when the loop starts or stops. */
  onCountIn?: (beat: number | null) => void;
  /** Fired after each complete 16-step loop, using a one-based loop count. */
  onLoopComplete?: (completedLoops: number) => void;
  /** Fired after maxLoops complete loops, but not when stop() is called. */
  onComplete?: () => void;
  /** Whole loops after the count-in. Omit for unlimited playback. */
  maxLoops?: number;
  /** Include the four-beat count-in. Defaults to true. */
  countIn?: boolean;
}

const TRACKS: TrackId[] = ["kick", "snare", "hihat"];
const STEPS = 16;

/**
 * One owner for Tone's transport and the drum voices. Instantiate once per app.
 * AudioContext initialization is deliberately deferred to a user gesture.
 */
export class BeatleAudioEngine {
  private kick?: Tone.MembraneSynth;
  private snare?: Tone.NoiseSynth;
  private snareBody?: Tone.Synth;
  private hihat?: Tone.NoiseSynth;
  private click?: Tone.Synth;
  private nodes: Tone.ToneAudioNode[] = [];
  private events: number[] = [];
  private generation = 0;
  private disposed = false;
  private running = false;
  private options?: PlaybackOptions;
  private lastTrigger: Partial<Record<TrackId, number>> = {};

  async init(): Promise<void> {
    if (this.disposed) throw new Error("This audio engine has been disposed.");
    // Tone.start() resumes a suspended AudioContext as well as creating it.
    await Tone.start();
    if (this.disposed) throw new Error("This audio engine has been disposed.");
    if (this.kick) return;

    const output = new Tone.Gain(0.8).toDestination();
    const limiter = new Tone.Limiter(-1).connect(output);
    const compressor = new Tone.Compressor({
      threshold: -18,
      ratio: 3,
      attack: 0.003,
      release: 0.12,
    }).connect(limiter);
    const snareFilter = new Tone.Filter(1_500, "highpass").connect(compressor);
    const hatFilter = new Tone.Filter(7_000, "highpass").connect(compressor);

    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.025,
      octaves: 5,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.24, sustain: 0, release: 0.1 },
      volume: -5,
    }).connect(compressor);

    this.snare = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.035 },
      volume: -11,
    }).connect(snareFilter);

    this.snareBody = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.001, decay: 0.075, sustain: 0, release: 0.02 },
      volume: -21,
    }).connect(compressor);

    this.hihat = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.012 },
      volume: -18,
    }).connect(hatFilter);

    this.click = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.015 },
      volume: -17,
    }).connect(compressor);

    this.nodes = [
      this.kick,
      this.snare,
      this.snareBody,
      this.hihat,
      this.click,
      snareFilter,
      hatFilter,
      compressor,
      limiter,
      output,
    ];
  }

  async play(
    pattern: RhythmPattern,
    bpm: number,
    options: PlaybackOptions = {},
  ): Promise<void> {
    if (!Number.isFinite(bpm) || bpm <= 0)
      throw new Error("BPM must be positive.");
    if (TRACKS.some((track) => pattern[track]?.length !== STEPS)) {
      throw new Error("Every drum track must contain exactly 16 steps.");
    }
    if (
      options.maxLoops !== undefined &&
      (!Number.isSafeInteger(options.maxLoops) || options.maxLoops <= 0)
    ) {
      throw new Error("The loop count must be a positive integer.");
    }

    // Invalidate pending play() calls before waiting for AudioContext startup.
    const generation = ++this.generation;
    this.stopPlayback();
    await this.init();
    if (generation !== this.generation || this.disposed) return;

    // A player's edits must not change a loop that has already been scheduled.
    const snapshot = Object.fromEntries(
      TRACKS.map((track) => [track, [...pattern[track]]]),
    ) as RhythmPattern;
    const transport = Tone.getTransport();
    const draw = Tone.getDraw();
    const secondsPerBeat = 60 / bpm;
    const loopSeconds = secondsPerBeat * 4;
    const countInSeconds = options.countIn === false ? 0 : loopSeconds;
    this.options = options;
    this.running = true;
    transport.bpm.value = bpm;
    transport.seconds = 0;

    for (let beat = 0; beat < (options.countIn === false ? 0 : 4); beat += 1) {
      this.events.push(
        transport.scheduleOnce((time) => {
          if (generation !== this.generation) return;
          this.click?.triggerAttackRelease(
            beat === 0 ? 1_000 : 800,
            0.025,
            time,
          );
          draw.schedule(() => {
            if (generation === this.generation) options.onCountIn?.(beat + 1);
          }, time);
        }, beat * secondsPerBeat),
      );
    }

    let scheduledSteps = 0;
    let loopStarted = false;
    this.events.push(
      transport.scheduleRepeat(
        (time) => {
          if (generation !== this.generation) return;
          // Tone schedules audio ahead of the drawing callback that stops us.
          // Guard the boundary here so a seventh loop can never sound.
          if (
            options.maxLoops !== undefined &&
            scheduledSteps >= options.maxLoops * STEPS
          )
            return;
          const currentStep = scheduledSteps % STEPS;
          for (const track of TRACKS) {
            if (snapshot[track][currentStep])
              this.trigger(track, time, currentStep % 4 === 0 ? 1 : 0.85);
          }
          draw.schedule(() => {
            if (generation !== this.generation) return;
            if (!loopStarted) {
              loopStarted = true;
              options.onCountIn?.(null);
            }
            options.onStep?.(currentStep);
          }, time);
          scheduledSteps += 1;
        },
        "16n",
        countInSeconds,
        options.maxLoops === undefined
          ? Infinity
          : options.maxLoops * loopSeconds,
      ),
    );

    if (options.maxLoops !== undefined || options.onLoopComplete) {
      let completedLoops = 0;
      this.events.push(
        transport.scheduleRepeat(
          (time) => {
            if (generation !== this.generation) return;
            draw.schedule(() => {
              if (generation !== this.generation) return;
              completedLoops += 1;
              options.onLoopComplete?.(completedLoops);
              // A loop callback may itself stop or replace this playback.
              if (generation !== this.generation) return;
              if (completedLoops === options.maxLoops) {
                ++this.generation;
                this.stopPlayback();
                options.onComplete?.();
              }
            }, time);
          },
          "1m",
          countInSeconds + loopSeconds,
        ),
      );
    }

    // A short lead time gives the audio scheduler room to place the first click.
    transport.start(Tone.now() + 0.05);
  }

  stop(): void {
    ++this.generation;
    this.stopPlayback();
  }

  async preview(track: TrackId): Promise<void> {
    const generation = this.generation;
    await this.init();
    if (this.disposed || generation !== this.generation) return;
    this.trigger(track, Tone.now(), 0.8);
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    for (const node of this.nodes) node.dispose();
    this.nodes = [];
    this.kick = undefined;
    this.snare = undefined;
    this.snareBody = undefined;
    this.hihat = undefined;
    this.click = undefined;
    this.lastTrigger = {};
  }

  private trigger(track: TrackId, time: number, velocity: number): void {
    // Two rapid pad activations can share an AudioContext timestamp. Tone's
    // noise sources require strictly increasing starts; previews can also race
    // notes already queued by the transport's lookahead scheduler.
    time = Math.max(time, (this.lastTrigger[track] ?? -Infinity) + 0.0001);
    this.lastTrigger[track] = time;
    if (track === "kick")
      this.kick?.triggerAttackRelease("C1", 0.08, time, velocity);
    if (track === "snare") {
      this.snare?.triggerAttackRelease(0.06, time, velocity);
      this.snareBody?.triggerAttackRelease(180, 0.055, time, velocity);
    }
    if (track === "hihat")
      this.hihat?.triggerAttackRelease(0.025, time, velocity);
  }

  private stopPlayback(): void {
    const transport = Tone.getTransport();
    for (const event of this.events) transport.clear(event);
    this.events = [];
    if (this.running) {
      transport.stop();
      transport.seconds = 0;
      const now = Tone.now();
      this.kick?.triggerRelease(now);
      this.snare?.triggerRelease(now);
      this.snareBody?.triggerRelease(now);
      this.hihat?.triggerRelease(now);
      this.click?.triggerRelease(now);
    }
    this.running = false;
    this.options?.onStep?.(-1);
    this.options?.onCountIn?.(null);
    this.options = undefined;
  }
}
