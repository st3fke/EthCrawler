document.addEventListener('DOMContentLoaded', function() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');
        switchTab(tabName);
      });
    });
  
    // Date picker max date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').setAttribute('max', today);
  });
  
  function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    
    // Deactivate all tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // Activate selected tab and form
    document.getElementById(`${tabName}-form`).classList.add('active');
    document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  }