require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Serve the frontend dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Supabase Admin client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// API Endpoint for your Android phone
app.post('/add-expense', async (req, res) => {
  // 1. Security: Check API Key
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }

  // 💥 NEW: Extract the new Money Manager tags!
  const { amount, merchant, timestamp, type, category, account } = req.body;

  // 2. Validate data
  if (!amount || !merchant || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Extract just the date (YYYY-MM-DD) from the timestamp
    const date = timestamp.split('T')[0];

    // 3. Save to database with the new columns
    const { data, error } = await supabase
      .from('expenses')
      .insert([{ 
        amount: amount, 
        merchant: merchant, 
        date: date, 
        created_at: timestamp,
        type: type || 'expense',              // Defaults to expense if empty
        category: category || 'Uncategorized', // Defaults to Uncategorized if empty
        account: account || 'K PLUS'           // Defaults to K PLUS if empty
      }]);

    if (error) throw error;

    res.status(200).json({ success: true, message: 'Transaction added successfully!' });
  } catch (error) {
    console.error('Error adding transaction:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
