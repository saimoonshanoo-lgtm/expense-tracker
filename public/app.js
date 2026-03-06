// --- Currency Setup ---
let currentCurrency = 'USD';
const exchangeRates = {
    USD: 1,
    THB: 35.0,   // 1 USD = 35 Baht
    MMK: 2100.0  // 1 USD = 2100 Kyat
};
const currencySymbols = {
    USD: '$',
    THB: '฿',
    MMK: 'K'
};

let expenses = [];
let chartInstance = null;

// --- Utility functions for dates ---
const getTodayStr = () => new Date().toISOString().split('T')[0];
const getMonthStr = () => new Date().toISOString().slice(0, 7);
const isThisWeek = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 7;
};

// --- Initialize Dashboard ---
async function init() {
    // 1. Fetch existing data using our specific client
    const { data } = await window.supabaseClient
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });
    
    expenses = data || [];
    updateDashboard();

    // 2. Subscribe to real-time updates!
    window.supabaseClient.channel('custom-all-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses' }, (payload) => {
            console.log('New expense received!', payload.new);
            expenses.unshift(payload.new); // Add new expense to the top
            updateDashboard(); // Re-render everything with current currency
        })
        .subscribe();
}

// --- Change Currency Trigger ---
window.changeCurrency = function(currency) {
    currentCurrency = currency;
    updateDashboard(); // Instantly recalculate everything when the dropdown changes
};

// --- Update UI & Do the Math ---
function updateDashboard() {
    let todayTotal = 0, weekTotal = 0, monthTotal = 0;
    const todayStr = getTodayStr();
    const monthStr = getMonthStr();
    const dailyData = {}; 

    const listContainer = document.getElementById('expense-list');
    listContainer.innerHTML = '';

    // Get the current rate and symbol
    const rate = exchangeRates[currentCurrency];
    const symbol = currencySymbols[currentCurrency];

    expenses.forEach((exp, index) => {
        // Grab the base USD amount and multiply it by the exchange rate
        const baseAmt = parseFloat(exp.amount);
        const convertedAmt = baseAmt * rate; 
        
        // Safety check: grab the date safely from created_at
        const expDate = exp.created_at ? exp.created_at.split('T')[0] : exp.date;

        // Calculate totals using the converted amount
        if (expDate === todayStr) todayTotal += convertedAmt;
        if (isThisWeek(expDate)) weekTotal += convertedAmt;
        if (expDate.startsWith(monthStr)) {
            monthTotal += convertedAmt;
            dailyData[expDate] = (dailyData[expDate] || 0) + convertedAmt;
        }

        // Render List (limit to 10 for neatness)
        if (index < 10) {
            const li = document.createElement('li');
            li.className = 'py-3 flex justify-between items-center';
            
            // Format the date nicely
            const niceDate = new Date(exp.created_at || exp.date).toLocaleString([], {
                month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
            });

            li.innerHTML = `
                <div>
                    <p class="font-bold text-gray-800">${exp.merchant}</p>
                    <p class="text-xs text-gray-500">${niceDate}</p>
                </div>
                <span class="font-bold text-red-500">-${symbol}${convertedAmt.toFixed(2)}</span>
            `;
            listContainer.appendChild(li);
        }
    });

    // Update the HTML text boxes with the new symbol and math
    document.getElementById('today-total').innerText = `${symbol}${todayTotal.toFixed(2)}`;
    document.getElementById('week-total').innerText = `${symbol}${weekTotal.toFixed(2)}`;
    document.getElementById('month-total').innerText = `${symbol}${monthTotal.toFixed(2)}`;

    updateChart(dailyData, symbol);
}

// --- Update Chart ---
function updateChart(dailyData, symbol) {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    const labels = Object.keys(dailyData).sort();
    const data = labels.map(date => dailyData[date]);

    if (chartInstance) chartInstance.destroy(); // Destroy old chart before re-drawing

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `Daily Spending (${symbol})`,
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += symbol + context.parsed.y.toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// --- Start the App ---
init();
