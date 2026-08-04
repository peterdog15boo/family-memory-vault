from pathlib import Path

p = Path(r"c:\Users\Jeff Roberts\family-memory-vault\src\components\memories\CreateMoviePanel.tsx")
text = p.read_text(encoding="utf-8")

old = """        {movie.downloadUrl || movie.playUrl ? (
          <button
            type=\"button\"
            disabled={sharing}
            onClick={() => void handleShare()}
            className=\"inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-ink/12 px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent/35 disabled:opacity-50 sm:flex-none\"
          >
            {sharing ? (
              <Loader2 className=\"size-3.5 animate-spin\" aria-hidden />
            ) : (
              <Share2 className=\"size-3.5\" aria-hidden />
            )}
            Share
          </button>
        ) : null}
        <button
          type=\"button\"
          onClick={onCreateAnother}
          className=\"inline-flex flex-1 items-center justify-center rounded-lg border border-ink/12 px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:text-ink sm:flex-none\"
        >
          Create another
        </button>
      </div>
    </div>
  );
}"""

new = """        {movie.downloadUrl || movie.playUrl ? (
          <button
            type=\"button\"
            onClick={() => setShareOpen(true)}
            className=\"inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-ink/12 px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent/35 sm:flex-none\"
          >
            <Share2 className=\"size-3.5\" aria-hidden />
            Share
          </button>
        ) : null}
        <button
          type=\"button\"
          onClick={onCreateAnother}
          className=\"inline-flex flex-1 items-center justify-center rounded-lg border border-ink/12 px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:text-ink sm:flex-none\"
        >
          Create another
        </button>
      </div>

      {shareOpen ? (
        <MovieShareDialog movie={movie} onClose={() => setShareOpen(false)} />
      ) : null}
    </div>
  );
}"""

if old not in text:
    raise SystemExit(f"block missing, idx={text.find('disabled={sharing}')}")

p.write_text(text.replace(old, new, 1), encoding="utf-8")
print("updated ReadyState share button")
