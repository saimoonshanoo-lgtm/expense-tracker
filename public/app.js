const db = window.supabaseClient; 

let currentCurrency = localStorage.getItem('preferredCurrency') || 'THB';
let allTransactions = []; 
let chartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('currency-select').value = currentCurrency;
    fetchTransactions();
});

function changeCurrency(currency) {
    currentCurrency = currency;
    localStorage.setItem('preferredCurrency', currency); 
    renderDashboard(); 
}

function formatCurrency(amount) {
    const locales = { 'THB': 'th-TH', 'USD': 'en-US', 'MMK': 'my-MM' };
    return new Intl.NumberFormat(locales[currentCurrency], {
        style: 'currency',
        currency: currentCurrency
    }).format(amount);
}

// Global function so our HTML folders can click it
window.toggleFolder = function(folderId) {
    const content = document.getElementById(`content-${folderId}`);
    const arrow = document.getElementById(`arrow-${folderId}`);
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        arrow.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        arrow.style.transform = 'rotate(0deg)';
    }
};

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

function renderDashboard() {
    let globalNetBalance = 0; 
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    
    const listContainer = document.getElementById('expense-list');
    listContainer.innerHTML = '';

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const currentMonthYearString = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

    // 1. Sort transactions into folders by Month and Year
    const groupedTransactions = {};

    allTransactions.forEach(tx => {
        const amount = parseFloat(tx.amount);
        const isIncome = tx.type === 'income' || (amount > 0 && tx.type !== 'expense'); 
        const displayAmount = Math.abs(amount);
        const txDate = new Date(tx.created_at);

        // A. Add to All-Time Net Balance
        if (isIncome) globalNetBalance += displayAmount;
        else globalNetBalance -= displayAmount;

        // B. Add to Monthly Totals
        if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
            if (isIncome) monthlyIncome += displayAmount;
            else monthlyExpense += displayAmount;
        }

        // C. Grouping logic
        const folderName = txDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        if (!groupedTransactions[folderName]) {
            groupedTransactions[folderName] = [];
        }
        groupedTransactions[folderName].push({ tx, displayAmount, isIncome, txDate });
    });

    // 2. Build the Folders visually
    for (const [folderName, transactions] of Object.entries(groupedTransactions)) {
        // Create a unique ID for the folder so we can open/close it
        const folderId = folderName.replace(/\s+/g, '-');
        const isCurrentMonth = folderName === currentMonthYearString;
        
        // Calculate the subtotal just for this specific folder
        let folderTotal = 0;
        transactions.forEach(t => {
            if (t.isIncome) folderTotal += t.displayAmount;
            else folderTotal -= t.displayAmount;
        });

        const folderDiv = document.createElement('div');
        folderDiv.className = 'bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden';
        
        // The clickable Header
        let folderHTML = `
            <button onclick="toggleFolder('${folderId}')" class="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100">
                <span class="font-bold text-gray-700">${folderName}</span>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold ${folderTotal >= 0 ? 'text-green-600' : 'text-gray-500'} bg-white px-2 py-1 rounded border shadow-sm">
                        Net: ${folderTotal >= 0 ? '+' : ''}${formatCurrency(folderTotal)}
                    </span>
                    <svg id="arrow-${folderId}" class="w-4 h-4 text-gray-400 transition-transform duration-200 ${isCurrentMonth ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
            </button>
            <ul id="content-${folderId}" class="divide-y divide-gray-100 ${isCurrentMonth ? '' : 'hidden'}">
        `;

        // The list of items inside the folder
        transactions.forEach(t => {
            folderHTML += `
                <li class="py-3 px-4 flex justify-between items-center bg-white">
                    <div>
                        <p class="font-bold text-sm text-gray-800">${t.tx.merchant}</p>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded uppercase">${t.tx.category || 'Uncategorized'}</span>
                            <span class="text-xs text-gray-400">${t.txDate.toLocaleString('en-US', {year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})} • ${t.tx.account || 'K PLUS'}</span>
                        </div>
                    </div>
                    <div class="${t.isIncome ? 'text-green-600' : 'text-red-500'} font-bold">
                        ${t.isIncome ? '+' : '-'}${formatCurrency(t.displayAmount)}
                    </div>
                </li>
            `;
        });

        folderHTML += `</ul>`;
        folderDiv.innerHTML = folderHTML;
        listContainer.appendChild(folderDiv);
    }

    // Update the top UI numbers
    document.getElementById('total-balance').innerText = formatCurrency(globalNetBalance);
    document.getElementById('month-income').innerText = '+' + formatCurrency(monthlyIncome);
    document.getElementById('month-expense').innerText = '-' + formatCurrency(monthlyExpense);

    renderChart();
}

function renderChart() {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const categoryTotals = {};
    allTransactions.forEach(tx => {
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
