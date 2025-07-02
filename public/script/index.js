const today = new Date().toISOString().split('T')[0];
document.getElementById('date').setAttribute('max', today);
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    
    // Deactivate all tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // Activate selected tab
    document.getElementById(tabName + '-form').classList.add('active');
    event.currentTarget.classList.add('active');
  }