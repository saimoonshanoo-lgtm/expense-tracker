// This connects to the Supabase library you loaded in index.html
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let expenses = [];
let chartInstance = null;

// Utility functions for dates
const getTodayStr = () => new Date().toISOString().split('T')[0];
const getMonthStr = () => new Date().toISOString().slice(0, 7);
const isThisWeek = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = Math.abs(today - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays <= 7;
};

// Initialize Dashboard
async function init() {
    // 1. Fetch existing data
    const { data } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });
    
    expenses = data || [];
    updateDashboard();

    // 2. Subscribe to real-time updates!
    supabase.channel('custom-all-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'expenses' }, (payload) => {
            console.log('New expense received!', payload.new);
            expenses.unshift(payload.new); // Add new expense to the top
            updateDashboard(); // Re-render everything
        })
        .subscribe();
}

// Update UI
function updateDashboard() {
    let todayTotal = 0, weekTotal = 0, monthTotal = 0;
    const todayStr = getTodayStr();
    const monthStr = getMonthStr();
    const dailyData = {}; // For the chart

    const listContainer = document.getElementById('expense-list');
    listContainer.innerHTML = '';

    expenses.forEach((exp, index) => {
        const amt = parseFloat(exp.amount);
        
        // Calculate totals
        if (exp.date === todayStr) todayTotal += amt;
        if (isThisWeek(exp.date)) weekTotal += amt;
        if (exp.date.startsWith(monthStr)) {
            monthTotal += amt;
            // Aggregate daily data for chart
            dailyData[exp.date] = (dailyData[exp.date] || 0) + amt;
        }

        // Render List (limit to 10 for neatness)
        if (index < 10) {
            const li = document.createElement('li');
            li.className = 'py-3 flex justify-between items-center';
            li.innerHTML = `
                <div>
                    <p class="font-bold text-gray-800">${exp.merchant}</p>
                    <p class="text-sm text-gray-500">${new Date(exp.created_at).toLocaleString()}</p>
                </div>
                <span class="font-bold text-red-500">-$${amt.toFixed(2)}</span>
            `;
            listContainer.appendChild(li);
        }
    });

    document.getElementById('today-total').innerText = `$${todayTotal.toFixed(2)}`;
    document.getElementById('week-total').innerText = `$${weekTotal.toFixed(2)}`;
    document.getElementById('month-total').innerText = `$${monthTotal.toFixed(2)}`;

    updateChart(dailyData);
}

function updateChart(dailyData) {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    
    // Sort dates logically
    const labels = Object.keys(dailyData).sort();
    const data = labels.map(date => dailyData[date]);

    if (chartInstance) chartInstance.destroy(); // Destroy old chart before re-drawing

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Daily Spending ($)',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Start the app

init();
