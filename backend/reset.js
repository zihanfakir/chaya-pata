const fs = require('fs');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');

async function resetPass() {
  try {
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(content);
    
    const user = data.users.find(u => u.username === 'zihanfakir');
    if (user) {
      user.password_hash = await bcrypt.hash('1234567890', 10);
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
      console.log('Password reset successfully to: 1234567890');
    } else {
      console.log('User zihanfakir not found in database.');
    }
  } catch(e) {
    console.log('Error:', e);
  }
}

resetPass();
