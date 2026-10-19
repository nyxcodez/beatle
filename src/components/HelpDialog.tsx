import { useEffect, useRef } from "react";
import { AudioLines, CheckCheck, Headphones, X } from "lucide-react";

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="help-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="help-title"
    >
      <div className="dialog-content">
        <button
          className="dialog-close icon-button"
          onClick={onClose}
          aria-label="Close instructions"
        >
          <X size={20} />
        </button>
        <p className="eyebrow">WELCOME TO YOUR DAILY RITUAL</p>
        <h2 id="help-title">
          A little listening.
          <br />
          <span>A lot of feeling.</span>
        </h2>
        <p className="dialog-intro">
          Hear a drum loop. Rebuild it from memory. See how close you can get.
        </p>
        <ol className="help-steps">
          <li>
            <span>
              <Headphones size={19} />
            </span>
            <div>
              <h3>Catch the beat.</h3>
              <p>
                Press the cyan listening button for a three-tick “3, 2, 1”
                count-in and up to six loops. You have one listening session:
                the pause button and Space shortcut unlock after the first
                complete loop. Pausing then ends listening permanently, even if
                all six loops haven’t finished. The grid unlocks when listening
                ends. Refreshing, switching modes, or submitting won’t restore
                the original beat.
              </p>
            </div>
          </li>
          <li>
            <span>
              <AudioLines size={19} />
            </span>
            <div>
              <h3>Make it yours.</h3>
              <p>
                Each column is a sixteenth note. Four steps make one beat; all
                16 make a bar. Tap pads for <b className="coral-text">kick</b>,{" "}
                <b className="cyan-text">snare</b>, and{" "}
                <b className="gold-text">hi-hat</b>. Preview instruments by
                clicking their names.
              </p>
              <p>
                Use arrow keys to move around the grid and Enter to toggle a
                pad. Space plays or pauses the active loop. Switching a pad on
                plays its sound; switching it off is silent. Play starts your
                beat immediately, without a count-in. You can edit or clear pads
                while your beat keeps playing—changes flow into the loop without
                restarting it. There’s no time limit to edit.
              </p>
            </div>
          </li>
          <li>
            <span>
              <CheckCheck size={19} />
            </span>
            <div>
              <h3>Trust your ears.</h3>
              <p>
                Submit when you’re ready. Your score is correct hits ÷ (required
                hits + extra hits) × 100, rounded to a whole number. An exact
                match earns 100; an empty grid earns 0. Missing hits reduce the
                number correct, and extra hits reduce the percentage. Three
                rounds add up to a maximum of 300 points.
              </p>
            </div>
          </li>
        </ol>
        <div className="help-daily-note">
          <span className="nav-dot" />
          <p>
            Daily rounds progress from <strong>Easy</strong> to{" "}
            <strong>Medium</strong> to <strong>Hard</strong> and reset at{" "}
            <strong>00:00 in your local time zone</strong>. Progress is saved in
            this browser. Want an encore? Practice has unlimited rounds.
          </p>
        </div>
        <button className="primary-button dialog-cta" onClick={onClose}>
          Let’s find that groove <Headphones size={16} />
        </button>
      </div>
    </dialog>
  );
}
