const db = window.supabaseClient; 

// 1. Check for saved currency, default to THB if none exists
let currentCurrency = localStorage.getItem('preferredCurrency') || 'THB';
let allTransactions = []; 
let chartInstance = null;

// Run this the second the page loads
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('currency-select').value = currentCurrency;
    fetchTransactions();
});

// 2. The function that runs when you change the dropdown
function changeCurrency(currency) {
    currentCurrency = currency;
    localStorage.setItem('preferredCurrency', currency); 
    renderDashboard(); 
}

// 3. The Money Formatter
function formatCurrency(amount) {
    const locales = { 'THB': 'th-TH', 'USD': 'en-US', 'MMK': 'my-MM' };
    return new Intl.NumberFormat(locales[currentCurrency], {
        style: 'currency',
        currency: currentCurrency
    }).format(amount);
}

// 4. Fetch data from Supabase
async function fetchTransactions() {
    const { data, error } = await db
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    allTransactions = data;
    renderDashboard();
}

// 5. Paint the screen & Do the Math
function renderDashboard() {
    // Separate All-Time math from Monthly math
    let globalNetBalance = 0; 
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    
    const listContainer = document.getElementById('expense-list');
    listContainer.innerHTML = '';

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    allTransactions.forEach(tx => {
        const amount = parseFloat(tx.amount);
        const isIncome = tx.type === 'income' || (amount > 0 && tx.type !== 'expense'); 
        const displayAmount = Math.abs(amount);
        const txDate = new Date(tx.created_at);

        // A. Add to All-Time Net Balance
        if (isIncome) {
            globalNetBalance += displayAmount;
        } else {
            globalNetBalance -= displayAmount;
        }

        // B. Add to Monthly Totals (Only if it matches the current month & year)
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
            if (isIncome) monthlyIncome += displayAmount;
            else monthlyExpense += displayAmount;
        }

        // Build the list item (Added the Year!)
        const li = document.createElement('li');
        li.className = 'py-3 flex justify-between items-center';
        li.innerHTML = `
            <div>
                <p class="font-bold text-sm text-gray-800">${tx.merchant}</p>
                <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded uppercase">${tx.category || 'Uncategorized'}</span>
                    <span class="text-xs text-gray-400">${txDate.toLocaleString('en-US', {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})} • ${tx.account || 'K PLUS'}</span>
                </div>
            </div>
            <div class="${isIncome ? 'text-green-600' : 'text-red-500'} font-bold">
                ${isIncome ? '+' : '-'}${formatCurrency(displayAmount)}
            </div>
        `;
        listContainer.appendChild(li);
    });

    // Update the UI
    document.getElementById('total-balance').innerText = formatCurrency(globalNetBalance);
    document.getElementById('month-income').innerText = '+' + formatCurrency(monthlyIncome);
    document.getElementById('month-expense').innerText = '-' + formatCurrency(monthlyExpense);

    renderChart();
}

// 6. Paint the Chart
function renderChart() {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const categoryTotals = {};
    allTransactions.forEach(tx => {
        // Only chart expenses
        if (tx.type === 'expense' || parseFloat(tx.amount) < 0) {
            const cat = tx.category || 'Uncategorized';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(parseFloat(tx.amount));
        }
    });

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryTotals),
            datasets: [{
                data: Object.values(categoryTotals),
                backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
