const env =require('../config/env.js')
const jwt=require('jsonwebtoken')
const users=require('../repositories/users.repo.js')

const {unauthenticated}=require('../lib/errors.js')



async function requireAuth(req,res,next) {
    const token=req.cookies?.token

    if(!token){
        throw unauthenticated()
    }

    let payload
    try {
        payload=jwt.verify(token,env.JWT_SECRET,{algorithms:['HS256']})

        
    } catch (error) {
        throw unauthenticated('Session expired, Please log in again')

    }

    // never put the password hash on req.user: GET /auth/me sends req.user to the browser
    const user=await users.findByIdWithoutPassword(Number(payload.sub))
    if(!user) throw unauthenticated()
    req.user=user

    next()

}

module.exports=requireAuth