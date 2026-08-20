'use client';

import React from 'react';

// Player-facing last resort for runtime/render/asset failures. Next's generic
// application-error surface strands a classroom player outside the save flow;
// this keeps recovery inside the game's visual shell and offers a clean return
// to the menu or a reload of the most recent autosave.
export class ThreeGameErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[three-game] unrecoverable runtime error', error, info);
  }

  returnToMenu = () => {
    this.setState({ error: null });
    this.props.onReturnToMenu?.();
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main
        className="three-game-shell fixed inset-0 flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-[#07100f] px-5 font-expedition text-expedition-parchment"
        role="alert"
      >
        <section className="w-full max-w-lg rounded-md border border-expedition-brass/70 bg-[rgba(13,18,20,0.94)] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-expedition-gold">Expedition interrupted</p>
          <h1 className="mt-2 font-serif text-3xl text-expedition-parchment">The game could not finish drawing this scene.</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-expedition-faded">
            Your latest expedition progress should still be saved. Reload to continue, or return to the main menu and choose a lighter graphics setting.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={this.reload}
              className="rounded-sm border border-expedition-gold bg-expedition-gold px-4 py-2 text-sm font-semibold text-expedition-ink"
            >
              Reload and continue
            </button>
            <button
              type="button"
              onClick={this.returnToMenu}
              className="rounded-sm border border-expedition-brass/70 bg-black/20 px-4 py-2 text-sm font-semibold text-expedition-parchment"
            >
              Return to main menu
            </button>
          </div>
        </section>
      </main>
    );
  }
}
