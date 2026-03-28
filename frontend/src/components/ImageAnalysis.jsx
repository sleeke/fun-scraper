import { useState } from 'react';
import { api } from '../api';
import { GENRE_EMOJI } from './eventUtils';

export default function ImageAnalysis({ event, onAnalysisComplete, toast }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(
    event.image_analysis && event.image_analysis_status === 'completed'
      ? (typeof event.image_analysis === 'string'
          ? JSON.parse(event.image_analysis)
          : event.image_analysis)
      : null
  );

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      const result = await api.analyzeEvent(event.id);
      setAnalysis(result.analysis);
      onAnalysisComplete && onAnalysisComplete(result.analysis);
      toast(result.cached ? '✨ Showing cached analysis' : '✨ Image analysis complete!', 'success');
    } catch (err) {
      toast(err.message || 'Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  }

  const hasAnalysis = analysis && (
    analysis.genres?.length > 0 ||
    analysis.artists?.length > 0 ||
    analysis.vibe ||
    analysis.description
  );

  return (
    <div className="image-analysis">
      {!hasAnalysis && (
        <button
          className="btn btn-secondary"
          onClick={handleAnalyze}
          disabled={analyzing}
          title="Use AI to extract genres, artists, and vibe from this event flyer"
        >
          {analyzing ? (
            <><span className="spinner" /> Analyzing…</>
          ) : (
            '🔍 Analyze Flyer'
          )}
        </button>
      )}

      {hasAnalysis && (
        <div className="image-analysis-result">
          {analysis.description && (
            <p className="image-analysis-description">{analysis.description}</p>
          )}
          <div className="image-analysis-grid">
            {analysis.genres?.length > 0 && (
              <div className="image-analysis-section">
                <span className="image-analysis-label">Detected Genres</span>
                <div className="image-analysis-tags">
                  {analysis.genres.map((g) => (
                    <span key={g} className="genre-badge">
                      {GENRE_EMOJI[g.toLowerCase()] || '🎶'} {g}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {analysis.artists?.length > 0 && (
              <div className="image-analysis-section">
                <span className="image-analysis-label">Detected Artists</span>
                <div className="image-analysis-tags">
                  {analysis.artists.map((a) => (
                    <span key={a} className="image-analysis-tag">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {analysis.vibe && (
            <div className="image-analysis-vibe">
              Vibe: <span className="image-analysis-vibe-value">{analysis.vibe}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
