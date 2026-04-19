import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  IS_FORK_RELEASE,
  RELEASE_REPOSITORY_SLUG,
  RELEASE_REPOSITORY_URL,
  UPSTREAM_REPOSITORY_URL,
} from "@/config/releaseSource";

const TWITTER_URL = "https://x.com/dimillian";

export function AboutView() {
  const [version, setVersion] = useState<string | null>(null);

  const handleOpenGitHub = () => {
    void openUrl(RELEASE_REPOSITORY_URL);
  };

  const handleOpenTwitter = () => {
    void openUrl(TWITTER_URL);
  };

  const handleOpenUpstream = () => {
    void openUrl(UPSTREAM_REPOSITORY_URL);
  };

  useEffect(() => {
    let active = true;
    const fetchVersion = async () => {
      try {
        const value = await getVersion();
        if (active) {
          setVersion(value);
        }
      } catch {
        if (active) {
          setVersion(null);
        }
      }
    };

    void fetchVersion();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="about">
      <div className="about-card">
        <div className="about-header">
          <img
            className="about-icon"
            src="/app-icon.png"
            alt="Codex Monitor icon"
          />
          <div className="about-title">Codex Monitor</div>
        </div>
        <div className="about-version">
          {version ? `Version ${version}` : "Version —"}
        </div>
        <div className="about-tagline">
          {IS_FORK_RELEASE
            ? `Fork build. Releases and updates come from ${RELEASE_REPOSITORY_SLUG}.`
            : "Monitor the situation of your Codex agents"}
        </div>
        <div className="about-divider" />
        <div className="about-links">
          <button
            type="button"
            className="about-link"
            onClick={handleOpenGitHub}
          >
            {IS_FORK_RELEASE ? "Fork GitHub" : "GitHub"}
          </button>
          <span className="about-link-sep">|</span>
          {IS_FORK_RELEASE ? (
            <button
              type="button"
              className="about-link"
              onClick={handleOpenUpstream}
            >
              Upstream
            </button>
          ) : (
            <button
              type="button"
              className="about-link"
              onClick={handleOpenTwitter}
            >
              Twitter
            </button>
          )}
        </div>
        <div className="about-footer">
          {IS_FORK_RELEASE
            ? `Fork build based on ${RELEASE_REPOSITORY_SLUG}. Upstream project by Dimillian.`
            : "Made with ♥ by Codex & Dimillian"}
        </div>
      </div>
    </div>
  );
}
