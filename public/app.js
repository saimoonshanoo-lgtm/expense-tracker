// --- Currency Setup ---
let currentCurrency = 'USD';
const exchangeRates = {
    USD: 1,
    THB: 35.0,
    MMK: 2100.0
};
const currencySymbols = { USD: '$', THB: '฿', MMK: 'K' };

let expenses = [];
let chartInstance = null;

// --- Utility functions ---
const getMonthStr = () => new Date().toISOString().slice(0, 7);

// --- Initialize Dashboard ---
async function init() {
    const { data } = await window.supabaseClient
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });
    
    expenses = data || [];
    updateDashboard();

    window.supabaseClient.channel('custom-all-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses' }, (payload) => {
            expenses.unshift(payload.new); 
            updateDashboard(); 
        })
        .subscribe();
}

// --- Change Currency Trigger ---
window.changeCurrency = function(currency) {
    currentCurrency = currency;
    updateDashboard(); 
};

// --- Update UI & Math ---
function updateDashboard() {
    let totalBalance = 0;
    let monthIncome = 0;
    let monthExpense = 0;
    
    const monthStr = getMonthStr();
    const dailyExpenses = {}; 

    const listContainer = document.getElementById('expense-list');
    listContainer.innerHTML = '';

    const rate = exchangeRates[currentCurrency];
    const symbol = currencySymbols[currentCurrency];

    expenses.forEach((exp, index) => {
        const baseAmt = parseFloat(exp.amount);
        const convertedAmt = baseAmt * rate; 
        
        const expDate = exp.created_at ? exp.created_at.split('T')[0] : exp.date;
        
        // Safety defaults for older test data that didn't have these
        const txType = exp.type || 'expense';
        const category = exp.category || 'Uncategorized';
        const account = exp.account || 'Unknown';

        // 1. Calculate True Balance
        if (txType === 'income') {
            totalBalance += convertedAmt;
            if (expDate.startsWith(monthStr)) monthIncome += convertedAmt;
        } else {
            totalBalance -= convertedAmt;
            if (expDate.startsWith(monthStr)) {
                monthExpense += convertedAmt;
                dailyExpenses[expDate] = (dailyExpenses[expDate] || 0) + convertedAmt;
            }
        }

        // 2. Render List (limit to 15)
        if (index < 15) {
            const li = document.createElement('li');
            li.className = 'py-3 flex justify-between items-center';
            
            const niceDate = new Date(exp.created_at || exp.date).toLocaleString([], {
                month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
            });

            // Color logic
            const isIncome = txType === 'income';
            const amountColor = isIncome ? 'text-green-600' : 'text-red-500';
            const amountPrefix = isIncome ? '+' : '-';

            li.innerHTML = `
                <div class="flex-1">
                    <p class="font-bold text-gray-800">${exp.merchant}</p>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">${category}</span>
                        <span class="text-xs text-gray-400">${niceDate} • ${account}</span>
                    </div>
                </div>
                <span class="font-bold text-lg ${amountColor}">${amountPrefix}${symbol}${convertedAmt.toFixed(2)}</span>
            `;
            listContainer.appendChild(li);
        }
    });

    // Update HTML text boxes
    document.getElementById('total-balance').innerText = `${symbol}${totalBalance.toFixed(2)}`;
    document.getElementById('month-income').innerText = `+${symbol}${monthIncome.toFixed(2)}`;
    document.getElementById('month-expense').innerText = `-${symbol}${monthExpense.toFixed(2)}`;

    updateChart(dailyExpenses, symbol);
}

// --- Update Chart (Shows Daily Expenses) ---
function updateChart(dailyData, symbol) {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    const labels = Object.keys(dailyData).sort();
    const data = labels.map(date => dailyData[date]);

    if (chartInstance) chartInstance.destroy(); 

    chartInstance = new Chart(ctx, {
        type: 'line', // Swapped to a line chart for a more premium look!
        data: {
            labels: labels,
            datasets: [{
                label: `Daily Expenses (${symbol})`,
                data: data,
                backgroundColor: 'rgba(239, 68, 68, 0.1)', // Tailwind Red-500
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 2,
                tension: 0.3, // Adds a nice curve to the line
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Start App
init();
