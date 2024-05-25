const jwt = require('jsonwebtoken');

// Middleware to check user role
function authMiddleware(allowedRoles) {
    return function(req, res, next) {
        // Extract JWT token from cookie or Authorization header
        let token;
        if (req.cookies.token) {
            token = req.cookies.token;
            console.log(token)
        } else {
             token = req.header('Authorization');
            const authHeader = req.headers['authorization'];
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

            try {
                // Verify and decode JWT token
                jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                  if (err) {
                    console.error('Error verifying token:', err);
                    return res.status(401).json({ error: 'Invalid token' });
                  }
          
                  console.log('Decoded token payload:', decoded);
                  const userID = decoded.userID;
                  const userRole = decoded.role; // or fetch from database
          
                  // Check if user role is allowed
                  if (!allowedRoles.includes(userRole)) {
                    return res.status(403).json({ error: 'Forbidden' });
                  }
          
                  // Attach user role to request object for further processing
                  req.userID= userID
                  req.userRole = userRole;
                  console.log(userID,userRole)
                  next();
                });
              } catch (error) {
                console.error('Error in authMiddleware:', error);
                return res.status(401).json({ error: 'Unauthorized' });
              }
    };
}

// Export the middleware function
module.exports = authMiddleware;
