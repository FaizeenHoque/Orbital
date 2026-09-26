# SPHEREx Sky Explorer - Space Apps Challenge 2026

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Git

### 1. Initialize Project

```bash
# Create project directory
mkdir spherex-sky-explorer
cd spherex-sky-explorer

# Initialize npm
npm init -y

# Install dependencies
npm install express cors axios dotenv leaflet react-leaflet cheerio sharp
npm install -D vite @vitejs/plugin-react tailwindcss postcss autoprefixer
```

### 2. Project Structure

```
spherex-sky-explorer/
├── public/
│   └── spherex-example.html          # Your uploaded SPHEREx data
├── src/
│   ├── components/
│   │   └── SkyExplorer.jsx           # Main React component
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── server/
│   ├── spherex-api.js                # API endpoints
│   ├── spherex-parser.js             # Data parser
│   └── server.js                     # Express server
├── data/
│   ├── spherex-catalog.json          # Processed observations
│   └── spherex-spatial-index.json    # Spatial index for fast lookup
├── .env                              # Environment variables
├── package.json
├── vite.config.js
└── README.md
```

### 3. Parse Your Data

```bash
# Copy your HTML file to public/
cp 1790441094847_spherex-example.html public/spherex-example.html

# Run parser
node server/spherex-parser.js
# Output: spherex-catalog.json, spherex-spatial-index.json
```

### 4. Create Express Server

**server/server.js:**

```javascript
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const spherexApi = require('./spherex-api');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.use('/api/spherex', spherexApi);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'SPHEREx Sky Explorer API running' });
});

app.listen(PORT, () => {
  console.log(`🌌 SPHEREx API running on http://localhost:${PORT}`);
});
```

### 5. Frontend Setup (Vite + React)

**vite.config.js:**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});
```

**src/App.jsx:**

```javascript
import React from 'react';
import SkyExplorer from './components/SkyExplorer';
import './App.css';

function App() {
  return (
    <div className="App">
      <SkyExplorer />
    </div>
  );
}

export default App;
```

### 6. Run Locally

```bash
# Terminal 1: Backend
node server/server.js

# Terminal 2: Frontend (in another terminal)
npm run dev
```

Visit `http://localhost:5173` in your browser.

---

## 📊 **Key Features to Implement**

### Phase 1: MVP (Nov 14-15, 2026 Hackathon)

- [x] Load and parse SPHEREx observation metadata
- [ ] Interactive sky coordinate selector
- [ ] Fetch images from NASA IRSA API
- [ ] Side-by-side comparison of surveys
- [ ] Time-lapse slider
- [ ] Basic moving object detection algorithm
- [ ] Display detected asteroids/comets

### Phase 2: Post-Hackathon

- [ ] 3D visualization (Three.js)
- [ ] Citizen science crowdsourcing
- [ ] Machine learning object classification
- [ ] Real-time data updates from IRSA
- [ ] Mobile responsiveness
- [ ] Shareable links for specific regions
- [ ] Export analysis as PDF reports

---

## 🔍 **Moving Object Detection Algorithm**

Your algorithm should:

1. **Load two survey images** from different dates
2. **Extract source catalogs** from FITS headers
3. **Match objects** between epochs (spatial matching within threshold)
4. **Calculate motion** in RA/Dec space
5. **Filter for real motion** (exclude errors, parallax)
6. **Classify object type** (asteroid, comet, brown dwarf, planet)
7. **Return detections** with confidence scores

Example Python approach (for more complex analysis):

```python
import numpy as np
from scipy.spatial.distance import cdist

def detect_moving_objects(catalog1, catalog2, tolerance=0.5):
    """
    Match objects between two catalogs and identify movers.
    
    Args:
        catalog1, catalog2: numpy arrays with [ra, dec, magnitude, id]
        tolerance: matching tolerance in arcseconds
    """
    
    # Build KD-tree for fast spatial matching
    from scipy.spatial import cKDTree
    
    coords1 = catalog1[:, :2]
    coords2 = catalog2[:, :2]
    
    tree1 = cKDTree(coords1)
    distances, indices = tree1.query(coords2, k=1)
    
    matched = []
    for i, (dist, idx) in enumerate(zip(distances, indices)):
        if dist < tolerance / 3600:  # Convert arcsec to degrees
            motion_ra = catalog2[i, 0] - catalog1[idx, 0]
            motion_dec = catalog2[i, 1] - catalog1[idx, 1]
            total_motion = np.sqrt(motion_ra**2 + motion_dec**2)
            
            if total_motion > 1/3600:  # Motion > 1 arcsec
                matched.append({
                    'id': catalog1[idx, 3],
                    'ra_motion': motion_ra,
                    'dec_motion': motion_dec,
                    'speed': total_motion,
                    'magnitude': catalog1[idx, 2]
                })
    
    return matched
```

---

## 🌐 **Integrating with NASA IRSA**

SPHEREx data is hosted at: `https://irsa.ipac.caltech.edu/`

### API Documentation

```bash
# Search observations near coordinates
curl "https://irsa.ipac.caltech.edu/ibe/search/spherex/qr2?POS=130,-38&SIZE=1&ct=csv"

# Get image cutout
curl "https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/..." > image.fits

# Browse data
https://irsa.ipac.caltech.edu/ibe/data/spherex/
```

### Backend Query Example

```javascript
async function getImageFromIRSA(ra, dec, size = 1) {
  const url = `https://irsa.ipac.caltech.edu/ibe/search/spherex/qr2?` +
    `POS=${ra},${dec}&SIZE=${size}&ct=csv`;
  
  const response = await axios.get(url);
  const lines = response.data.split('\n');
  
  // Parse CSV and extract image URLs
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    return {
      obs_id: cols[0],
      access_url: cols[15],
      wavelength: cols[12]
    };
  });
}
```

---

## 🎨 **UI/UX Best Practices**

1. **Accessibility**
   - High contrast for dark theme
   - Keyboard navigation
   - Alt text for all images
   - ARIA labels for interactive elements

2. **Performance**
   - Lazy load images
   - Cache observations with Redis
   - Compress FITS files to JPEG previews
   - Paginate results

3. **Design**
   - Use dark theme (astronomy aesthetic)
   - Color-code different wavelength bands
   - Highlight detected moving objects in red/yellow
   - Responsive grid layout

---

## 📋 **Deployment**

### Vercel (Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Railway or Heroku (Backend)

```bash
# Create Procfile
echo "web: node server/server.js" > Procfile

# Deploy to Railway
railway up

# Or Heroku
git push heroku main
```

---

## 🎯 **Judging Criteria (Space Apps Challenge)**

Focus on:

1. **Technical Innovation**
   - Novel approach to object detection
   - Efficient data handling
   - Real-time processing capability

2. **User Experience**
   - Intuitive interface
   - Fast load times
   - Educational value

3. **Data Accuracy**
   - Proper astronomical coordinate systems
   - Correct interpretation of SPHEREx wavelengths
   - Validation against NASA data

4. **Impact & Viability**
   - Can scientists actually use this?
   - Can citizens contribute?
   - Is it extensible?

---

## 📚 **Resources**

- **SPHEREx Official**: https://spherex.caltech.edu/
- **IRSA Data Archive**: https://irsa.ipac.caltech.edu/
- **FITS Format**: https://fits.gsfc.nasa.gov/
- **Astronomical Catalogs**: https://simbad.u-strasbg.fr/
- **Space Apps Docs**: https://www.spaceappschallenge.org/

---

## 💡 **Advanced Ideas**

- **Machine Learning**: Train CNN to classify object types from images
- **Redshift Estimation**: Use spectral data to estimate distances
- **Orbital Mechanics**: Predict future positions of detected asteroids
- **WebGL Rendering**: 3D visualization of galaxy distributions
- **Blockchain**: Log citizen discoveries with smart contracts
- **VR Integration**: Explore the cosmos in virtual reality
- **Real-time Collaboration**: Multiple users exploring simultaneously

---

Happy coding! 🚀 Good luck with the Space Apps Challenge!
