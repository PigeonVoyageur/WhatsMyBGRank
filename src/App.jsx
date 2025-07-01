import React, { useState, useRef, useEffect } from 'react'
import './App.css'

function App() {
  const [players, setPlayers] = useState([''])
  const [gameMode, setGameMode] = useState('battlegroundsduo')
  const [season, setSeason] = useState(10)
  const [region, setRegion] = useState('EU')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchProgress, setSearchProgress] = useState('')
  const [shouldStop, setShouldStop] = useState(false)
  const inputRefs = useRef([]);
  const shouldStopRef = useRef(false);

  // Fonction pour ajouter un nouveau champ joueur
  const addPlayer = () => {
    if (players.length < 8) {
      const newPlayers = [...players, ''];
      setPlayers(newPlayers);
      
      // Focus sur le nouveau champ après que le DOM soit mis à jour
      setTimeout(() => {
        const newIndex = newPlayers.length - 1;
        if (inputRefs.current[newIndex]) {
          inputRefs.current[newIndex].focus();
        }
      }, 0);
    }
  }

  // Fonction pour supprimer un champ joueur
  const removePlayer = (index) => {
    const newPlayers = players.filter((_, i) => i !== index);
    setPlayers(newPlayers);
    
    // Ajuster les références
    inputRefs.current = inputRefs.current.slice(0, newPlayers.length);
  }

  // Fonction pour mettre à jour le nom d'un joueur
  const updatePlayer = (index, value) => {
    const newPlayers = [...players]
    newPlayers[index] = value
    setPlayers(newPlayers)
  }

  // Fonction pour récupérer les données de l'API
  const fetchLeaderboardData = async (page = 1) => {
    const actualSeasonId = gameMode === 'battlegroundsduo' ? season + 5 : season;
    const isLocal = import.meta.env.DEV;
    const baseURL = isLocal 
      ? '/api' 
      : 'https://playhearthstone.com';
    // Utiliser seulement le proxy Vite qui est le plus rapide
    const viteProxyUrl = `${baseURL}/fr-fr/api/community/leaderboardsData?region=${region}&leaderboardId=${gameMode}&seasonId=${actualSeasonId}&page=${page}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // Timeout de 10s
      
      const response = await fetch(viteProxyUrl, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Cache-Control': 'max-age=300' // Cache pendant 5 minutes
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn(`Timeout pour la page ${page}`);
      } else {
        console.error(`Erreur page ${page}:`, error);
      }
      return null;
    }
  }

  // Fonction pour arrêter la recherche
  const stopSearch = () => {
    shouldStopRef.current = true;
    setShouldStop(true);
  };

  // Fonction principale de recherche
  const searchPlayers = async () => {
    setLoading(true);
    setResults([]);
    setSearchProgress('');
    setShouldStop(false);
    shouldStopRef.current = false; // Reset de la ref

    const playersToSearch = players.filter(player => player.trim() !== '');
    const foundPlayers = {};
    let totalPlayersFound = 0;
    let totalSize = 0;
    let totalPages = 0;

    try {
      setSearchProgress('Initialisation de la recherche...');
      
      // D'abord récupérer la première page pour obtenir le nombre total de pages
      const firstPageData = await fetchLeaderboardData(1);
      if (!firstPageData?.leaderboard?.pagination) {
        throw new Error('Impossible de récupérer les informations de pagination');
      }

      totalPages = firstPageData.leaderboard.pagination.totalPages;
      totalSize = firstPageData.leaderboard.pagination.totalSize;

      // Traiter la première page
      processPageData(firstPageData, playersToSearch, foundPlayers);
      updateRealTimeResults(playersToSearch, foundPlayers, totalSize);

      // Vérifier si on doit s'arrêter après la première page
      if (shouldStopRef.current) {
        setSearchProgress('Recherche arrêtée par l\'utilisateur');
        return;
      }

      // **TRAITEMENT PARALLÈLE PAR LOTS DE 5 PAGES**
      const BATCH_SIZE = 5;
      let pagesProcessed = 1; // On a déjà traité la page 1

      for (let startPage = 2; startPage <= totalPages; startPage += BATCH_SIZE) {
        // Vérifier si on doit s'arrêter AVANT chaque lot
        if (shouldStopRef.current) {
          break;
        }

        const endPage = Math.min(startPage + BATCH_SIZE - 1, totalPages);
        const pagePromises = [];

        // Calculer le pourcentage avant de commencer le lot
        const percentage = Math.round((pagesProcessed / totalPages) * 100);
        setSearchProgress(`${percentage}% (${Object.keys(foundPlayers).length} trouvé(s))`);

        // Créer les promesses pour toutes les pages du lot
        for (let page = startPage; page <= endPage; page++) {
          pagePromises.push(fetchLeaderboardData(page));
        }

        // Attendre que toutes les pages du lot soient récupérées EN PARALLÈLE
        const batchResults = await Promise.allSettled(pagePromises);
        
        // Vérifier si on doit s'arrêter APRÈS avoir récupéré le lot
        if (shouldStopRef.current) {
          break;
        }
        
        // Traiter les résultats du lot
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            processPageData(result.value, playersToSearch, foundPlayers);
            pagesProcessed++;
          } else {
            console.warn(`Erreur page ${startPage + index}:`, result.reason);
            pagesProcessed++; // Compter même les pages en erreur
          }
        });

        // Mettre à jour les résultats après chaque lot
        updateRealTimeResults(playersToSearch, foundPlayers, totalSize);
        
        // Petite pause entre les lots pour éviter de surcharger l'API
        // ET vérifier pendant la pause si on doit s'arrêter
        for (let i = 0; i < 20; i++) { // 20 * 10ms = 200ms
          if (shouldStopRef.current) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Finaliser les résultats
      const finalResults = [];
      playersToSearch.forEach(searchPlayer => {
        if (foundPlayers[searchPlayer] && foundPlayers[searchPlayer].length > 0) {
          const sortedResults = foundPlayers[searchPlayer].sort((a, b) => a.rank - b.rank);
          finalResults.push(...sortedResults);
        } else {
          finalResults.push({
            rank: totalSize > 0 ? `<${totalSize + 1}` : 'Inconnu',
            pseudo: searchPlayer,
            rating: 'Non trouvé'
          });
        }
      });

      setResults(finalResults);
      setSearchProgress(shouldStopRef.current ? 
        `Recherche arrêtée par l'utilisateur (${pagesProcessed}/${totalPages} pages traitées)` : 
        `100% - Recherche terminée (${totalPages}/${totalPages} pages traitées)`
      );

    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      setSearchProgress('Erreur lors de la recherche');
    } finally {
      setLoading(false);
      shouldStopRef.current = false; // Reset final
    }
  };

  // Fonction utilitaire pour traiter les données d'une page
  const processPageData = (data, playersToSearch, foundPlayers) => {
    if (!data?.leaderboard?.rows) return;

    data.leaderboard.rows.forEach((row) => {
      const playerName = row.accountid;
      const playerRank = row.rank;
      const playerRating = row.rating;
      
      playersToSearch.forEach(searchPlayer => {
        const searchLower = searchPlayer.toLowerCase().trim();
        const playerLower = playerName.toLowerCase();
        
        if (playerLower === searchLower || 
            playerLower.includes(searchLower) || 
            searchLower.includes(playerLower)) {
          
          if (!foundPlayers[searchPlayer]) {
            foundPlayers[searchPlayer] = [];
          }
          
          // Éviter les doublons
          const existingEntry = foundPlayers[searchPlayer].find(
            entry => entry.rank === playerRank && entry.pseudo === playerName
          );
          
          if (!existingEntry) {
            foundPlayers[searchPlayer].push({
              rank: playerRank,
              pseudo: playerName,
              rating: playerRating,
              searchedFor: searchPlayer
            });
          }
        }
      });
    });
  };

  // Fonction utilitaire pour mettre à jour les résultats en temps réel
  const updateRealTimeResults = (playersToSearch, foundPlayers, totalSize) => {
    const currentResults = [];
    
    playersToSearch.forEach(searchPlayer => {
      if (foundPlayers[searchPlayer] && foundPlayers[searchPlayer].length > 0) {
        const sortedResults = foundPlayers[searchPlayer].sort((a, b) => a.rank - b.rank);
        currentResults.push(...sortedResults);
      } else {
        currentResults.push({
          rank: 'Recherche en cours...',
          pseudo: searchPlayer,
          rating: 'Recherche en cours...'
        });
      }
    });

    setResults(currentResults);
  };

  // Fonction utilitaire pour finaliser les résultats
  const finalizeResults = (playersToSearch, foundPlayers, totalSize) => {
    const finalResults = [];
    
    playersToSearch.forEach(searchPlayer => {
      if (foundPlayers[searchPlayer] && foundPlayers[searchPlayer].length > 0) {
        const sortedResults = foundPlayers[searchPlayer].sort((a, b) => a.rank - b.rank);
        finalResults.push(...sortedResults);
      } else {
        finalResults.push({
          rank: totalSize > 0 ? `<${totalSize + 1}` : 'Inconnu',
          pseudo: searchPlayer,
          rating: 'Non trouvé'
        });
      }
    });

    setResults(finalResults);
    setSearchProgress(shouldStop ? 'Recherche arrêtée par l\'utilisateur' : 'Recherche terminée');
  };

  return (
    <div className="app">
      <h1>WhatsMyBGRank - Recherche de Classement Hearthstone</h1>
      
      <div className="form-container">
        {/* Section joueurs */}
        <div className="players-section">
          <h3>Joueurs à rechercher (max 8)</h3>
          {players.map((player, index) => (
            <div key={index} className="player-input-group">
              <input
                ref={el => inputRefs.current[index] = el}
                type="text"
                className="player-input"
                placeholder={`Nom du joueur ${index + 1}`}
                value={player}
                onChange={(e) => updatePlayer(index, e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && players.length < 8) {
                    addPlayer();
                  }
                }}
              />
              {players.length > 1 && (
                <button 
                  type="button" 
                  className="remove-player-btn"
                  onClick={() => removePlayer(index)}
                  title="Supprimer ce joueur"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          
          {players.length < 8 && (
            <button 
              type="button" 
              className="add-player-btn"
              onClick={addPlayer}
            >
              + Ajouter un joueur
            </button>
          )}
        </div>

        {/* Section paramètres */}
        <div className="settings-section">
          <div className="setting-group">
            <label htmlFor="gameMode">Mode de jeu:</label>
            <select 
              id="gameMode"
              value={gameMode} 
              onChange={(e) => {
                setGameMode(e.target.value)
                setSeason(e.target.value === 'battlegroundsduo' ? 7 : 1)
              }}
            >
              <option value="battlegrounds">Battlegrounds Solo</option>
              <option value="battlegroundsduo">Battlegrounds Duo</option>
            </select>
          </div>

          <div className="setting-group">
            <label htmlFor="season">Saison:</label>
            <select 
              id="season"
              value={season} 
              onChange={(e) => setSeason(parseInt(e.target.value))}
            >
              {gameMode === 'battlegroundsduo' 
                ? [7, 8, 9, 10].map(s => (
                    <option key={s} value={s}>Saison {s}</option>
                  ))
                : Array.from({length: 10}, (_, i) => i + 1).map(s => (
                    <option key={s} value={s}>Saison {s}</option>
                  ))
              }
            </select>
          </div>

          <div className="setting-group">
            <label htmlFor="region">Région:</label>
            <select 
              id="region"
              value={region} 
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="EU">Europe</option>
              <option value="US">États-Unis</option>
              <option value="AP">Asie-Pacifique</option>
            </select>
          </div>

        </div>

        {/* Boutons de recherche */}
        <div className="search-buttons">
          {!loading ? (
            <button 
              className="search-btn"
              onClick={searchPlayers}
              disabled={players.filter(p => p.trim() !== '').length === 0}
            >
              🔍 Rechercher les joueurs
            </button>
          ) : (
            <button 
              className="stop-btn"
              onClick={stopSearch}
            >
               Arrêter la recherche
            </button>
          )}
        </div>

        {/* Indicateur de progression */}
        {searchProgress && (
          <div className="progress-indicator">
            <div className="progress-text">{searchProgress}</div>
            {loading && (
              <div className="progress-bar">
                <div 
                  className="progress-bar-fill" 
                  style={{ 
                    width: `${searchProgress.match(/(\d+)%/) ? searchProgress.match(/(\d+)%/)[1] : 0}%` 
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Résultats */}
      {results.length > 0 && (
        <div className="results-section">
          <h3>Résultats de la recherche ({results.filter(r => r.rating !== 'Non trouvé').length} trouvé(s))</h3>
          <div className="results-table">
            <div className="table-header">
              <span>Rang</span>
              <span>Pseudo</span>
              <span>Côte</span>
            </div>
            {results.map((result, index) => (
              <div key={index} className="table-row">
                <span className={result.rank === '8000+' ? 'not-found' : ''}>{result.rank}</span>
                <span className={result.rating === 'Non trouvé' ? 'not-found' : ''}>{result.pseudo}</span>
                <span className={result.rating === 'Non trouvé' ? 'not-found' : ''}>{result.rating}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
