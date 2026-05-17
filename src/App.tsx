
function App() {
  return (
    <div className="app-container">
      <header className="top-nav">
        <h1>WC2026 Prediction Pool</h1>
        <div className="balance-chip">1,000,000 coins</div>
      </header>
      
      <main className="dashboard">
        <section className="hero">
          <h2>Next Match in</h2>
          <div className="countdown">24:00:00</div>
        </section>
        
        <section className="match-list">
          <div className="match-card live">
            <div className="match-teams">
              <span>Brazil</span>
              <span className="score">2 - 1</span>
              <span>France</span>
            </div>
            <div className="match-status neon-text">LIVE</div>
          </div>
          
          <div className="match-card">
            <div className="match-teams">
              <span>Argentina</span>
              <span>vs</span>
              <span>Spain</span>
            </div>
            <button className="btn-predict">Predict Match</button>
          </div>
        </section>
        
        <section className="leaderboard">
          <h3>Live Leaderboard</h3>
          <ol>
            <li>Player 1 - 1,200,000</li>
            <li>Player 2 - 1,050,000</li>
            <li>Player 3 - 900,000</li>
          </ol>
        </section>
      </main>
      
    </div>
  );
}

export default App;