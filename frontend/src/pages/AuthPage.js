import '../styles/AuthPage.css';

import { useState } from 'react';
import Login from '../components/Login';
import Register from '../components/Register';
import Lightning from '../ogl/Lightning';


const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);

    return (
        <div className='Auth-container'>
            <div style={{ 
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%', 
                height: '100%',
                zIndex: 0
            }}>
                <Lightning
                    hue={220}
                    xOffset={.5}
                    speed={.4}
                    intensity={.4}
                    size={.8}
                />
            </div>

            
            
            <div className="auth-content" style={{ position: 'relative', zIndex: 1 }}>
                {isLogin ? <Login ChangeLogin={setIsLogin} setIsLogin={setIsLogin}/> : <Register ChangeLogin={setIsLogin} setIsLogin={setIsLogin}/>}               
            </div>
        </div>
    )
}

export default AuthPage;