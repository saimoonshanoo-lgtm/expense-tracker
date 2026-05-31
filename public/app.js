const db = window.supabaseClient; 

let currentCurrency = localStorage.getItem('preferredCurrency') || 'THB';
let allTransactions = []; 
let chartInstance = null;

// Your new Budget Constants
const WEEKLY_ALLOWANCE = 1500;
const WEEKLY_SPENDING_LIMIT = 1330; 
const NECESSARY_SAVINGS_TARGET = 170;

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

window.toggleFolder = function(folderId) {
    const content = document.getElementById(`content-${folderId}`);
    const arrow = document.getElementById(`arrow-${folderId}`);
    if (content && content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    } else if (content) {
        content.classList.add('hidden');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
};

// 1. The Calendar Brain: Groups dates from Saturday to Friday
function getSaturdayWeekRange(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth();
    
    // Find all Saturdays in this specific month
    const saturdays = [];
    let tempDate = new Date(year, month, 1);
    while (tempDate.getMonth() === month) {
        if (tempDate.getDay() === 6) { // 6 = Saturday
            saturdays.push(tempDate.getDate());
        }
        tempDate.setDate(tempDate.getDate() + 1);
    }

    const currentDayIndex = d.getDate();
    
    // If the transaction is before the first Saturday, count it as Week 1 (Early)
    if (saturdays.length === 0 || currentDayIndex < saturdays[0]) {
        return { label: "Week 1", isCurrent: (new Date().getMonth() === month && new Date().getDate() < saturdays[0]) };
    }

    // Match the date to the correct Saturday-Friday block
    for (let i = 0; i < saturdays.length; i++) {
        const startSat = saturdays[i];
        const endFri = saturdays[i + 1] ? saturdays[i + 1] - 1 : new Date(year, month + 1, 0).getDate();
        
        if (currentDayIndex >= startSat && currentDayIndex <= endFri) {
            const today = new Date();
            const isCurrent = (today.getFullYear() === year && today.getMonth() === month && today.getDate() >= startSat && today.getDate() <= endFri);
            return { label: `Week ${i + 1} (Sat ${startSat} - Fri ${endFri})`, isCurrent };
        }
    }
    return { label: "Week 4/5 (End of Month)", isCurrent: false };
}

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
    let currentWeekSpent = 0;
    let totalNecessarySavings = 0;
    let monthlyTreatFund = 0;
    
    const listContainer = document.getElementById('expense-list');
    listContainer.innerHTML = '';

    const currentMonthNum = new Date().getMonth();
    const currentYearNum = new Date().getFullYear();

    const monthGroups = {};

    // 2. Process all transactions
    allTransactions.forEach(tx => {
        const amount = parseFloat(tx.amount);
        const isIncome = tx.type === 'income' || (amount > 0 && tx.type !== 'expense'); 
        const displayAmount = Math.abs(amount);
        const txDate = new Date(tx.created_at);

        if (isIncome) globalNetBalance += displayAmount;
        else globalNetBalance -= displayAmount;

        const monthName = txDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        if (!monthGroups[monthName]) monthGroups[monthName] = {};

        const weekInfo = getSaturdayWeekRange(txDate);
        if (!monthGroups[monthName][weekInfo.label]) {
            monthGroups[monthName][weekInfo.label] = {
                transactions: [],
                weeklyExpenseTotal: 0,
                isCurrentWeek: weekInfo.isCurrent,
                isInCurrentMonth: (txDate.getMonth() === currentMonthNum && txDate.getFullYear() === currentYearNum)
            };
        }

        if (!isIncome) {
            monthGroups[monthName][weekInfo.label].weeklyExpenseTotal += displayAmount;
            if (weekInfo.isCurrent) {
                currentWeekSpent += displayAmount;
            }
        }

        monthGroups[monthName][weekInfo.label].transactions.push({ tx, displayAmount, isIncome, txDate });
    });

    // 3. Calculate Savings and Treat Funds from past weeks
    Object.keys(monthGroups).forEach(mName => {
        Object.keys(monthGroups[mName]).forEach(wLabel => {
            const weekObj = monthGroups[mName][wLabel];
            
            // We only calculate this for past, completed weeks in the current month
            if (weekObj.isInCurrentMonth && !weekObj.isCurrentWeek) {
                const leftover = WEEKLY_ALLOWANCE - weekObj.weeklyExpenseTotal;
                
                if (leftover > 0) {
                    // Extract the required 170 for necessary savings
                    if (leftover >= NECESSARY_SAVINGS_TARGET) {
                        totalNecessarySavings += NECESSARY_SAVINGS_TARGET;
                        monthlyTreatFund += (leftover - NECESSARY_SAVINGS_TARGET); // The rest is a treat!
                    } else {
                        // If leftover is less than 170, it all goes to necessary savings, no treat.
                        totalNecessarySavings += leftover;
                    }
                }
            }
        });
    });

    // 4. Build the Visual Folders
    for (const [monthName, weeks] of Object.entries(monthGroups)) {
        const monthId = monthName.replace(/\s+/g, '-');
        const isCurrentMonth = monthName === new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

        const monthDiv = document.createElement('div');
        monthDiv.className = 'bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4';
        
        let monthHTML = `
            <button onclick="toggleFolder('${monthId}')" class="w-full flex justify-between items-center p-4 bg-blue-50 hover:bg-blue-100 transition-colors border-b border-blue-100">
                <span class="font-bold text-blue-900">${monthName}</span>
                <svg id="arrow-${monthId}" class="w-4 h-4 text-blue-600 transition-transform duration-200 ${isCurrentMonth ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </button>
            <div id="content-${monthId}" class="p-3 space-y-3 ${isCurrentMonth ? '' : 'hidden'}">
        `;

        for (const [weekLabel, weekData] of Object.entries(weeks)) {
            const weekId = (monthId + '-' + weekLabel).replace(/[^a-zA-Z0-9]/g, '-');
            
            monthHTML += `
                <div class="border border-gray-100 rounded-lg overflow-hidden shadow-xs">
                    <button onclick="toggleFolder('${weekId}')" class="w-full flex justify-between items-center py-2 px-3 bg-gray-50 hover:bg-gray-100 text-xs font-semibold text-gray-600">
                        <span>${weekLabel} ${weekData.isCurrentWeek ? '• 🟢 Active Week' : ''}</span>
                        <span class="bg-white px-2 py-0.5 rounded border text-red-500 font-bold">Spent: ${formatCurrency(weekData.weeklyExpenseTotal)}</span>
                    </button>
                    <ul id="content-${weekId}" class="divide-y divide-gray-100 ${weekData.isCurrentWeek ? '' : 'hidden'}">
            `;

            weekData.transactions.forEach(t => {
                monthHTML += `
                    <li class="py-2 px-3 flex justify-between items-center bg-white text-xs">
                        <div>
                            <p class="font-bold text-gray-800">${t.tx.merchant}</p>
                            <p class="text-[10px] text-gray-400">${t.txDate.toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</p>
                        </div>
                        <div class="${t.isIncome ? 'text-green-600' : 'text-red-500'} font-bold">
                            ${t.isIncome ? '+' : '-'}${formatCurrency(t.displayAmount)}
                        </div>
                    </li>
                `;
            });

            monthHTML += `</ul></div>`;
        }
        monthHTML += `</div>`;
        monthDiv.innerHTML = monthHTML;
        listContainer.appendChild(monthDiv);
    }

    // 5. Update Text Metrics
    document.getElementById('total-balance').innerText = formatCurrency(globalNetBalance);
    document.getElementById('current-week-spent').innerText = formatCurrency(currentWeekSpent);
    
    const remainingAllowance = WEEKLY_ALLOWANCE - currentWeekSpent;
    document.getElementById('current-week-remaining').innerText = formatCurrency(Math.max(0, remainingAllowance));
    document.getElementById('necessity-savings').innerText = formatCurrency(totalNecessarySavings);
    document.getElementById('monthly-treat-fund').innerText = formatCurrency(monthlyTreatFund);

    // 6. Handle the Warning Banners & Progress Bar
    const progressPercent = Math.min(100, (currentWeekSpent / WEEKLY_ALLOWANCE) * 100);
    const progressBar = document.getElementById('weekly-progress-bar');
    progressBar.style.width = `${progressPercent}%`;

    const alertBox = document.getElementById('budget-alert-container');
    
    // Warning Logic
    if (currentWeekSpent >= WEEKLY_SPENDING_LIMIT) {
        // Exceeded 1330 Daily Spending Pool
        progressBar.className = "bg-red-600 h-2.5 rounded-full animate-pulse transition-all duration-500";
        alertBox.className = "block px-4 pt-4";
        alertBox.innerHTML = `
            <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 rounded shadow-xs text-xs font-bold animate-bounce" role="alert">
                ⚠️ OVER BUDGET: You hit your ฿1,330 limit for the week! Any more spending eats directly into your necessary savings.
            </div>`;
    } else if (currentWeekSpent >= (WEEKLY_SPENDING_LIMIT * 0.85)) {
        // Approaching the 1330 limit (around 1130 spent)
        progressBar.className = "bg-orange-500 h-2.5 rounded-full transition-all duration-500";
        alertBox.className = "block px-4 pt-4";
        alertBox.innerHTML = `
            <div class="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-3 rounded shadow-xs text-xs font-bold" role="alert">
                ⚠️ WARNING: You are approaching your ฿1,330 limit. Slow down your spending!
            </div>`;
    } else {
        progressBar.className = "bg-blue-600 h-2.5 rounded-full transition-all duration-500";
        alertBox.className = "hidden";
    }

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
                backgroundColor: ['#f43f5e', '#3b82f6', '#eab308', '#14b8a6', '#a855f7']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}
