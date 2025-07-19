// API route pour Vercel qui sert de proxy vers l'API Hearthstone
export default async function handler(req, res) {
  // Permettre CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Gérer les requêtes OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { region, leaderboardId, seasonId, page } = req.query;

    // Validation des paramètres
    if (!region || !leaderboardId || !seasonId || !page) {
      res.status(400).json({ 
        error: 'Missing required parameters: region, leaderboardId, seasonId, page' 
      });
      return;
    }

    // Construire l'URL de l'API Hearthstone
    const apiUrl = `https://hearthstone.blizzard.com/fr-fr/api/community/leaderboardsData?region=${region}&leaderboardId=${leaderboardId}&seasonId=${seasonId}&page=${page}`;

    // Faire la requête vers l'API Hearthstone
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Referer': 'https://hearthstone.blizzard.com/',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Ajouter des headers de cache pour optimiser les performances
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache pendant 5 minutes
    
    res.status(200).json(data);

  } catch (error) {
    console.error('Error fetching leaderboard data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch leaderboard data',
      message: error.message 
    });
  }
}
