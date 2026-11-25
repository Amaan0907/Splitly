const path=require('path')
require("dotenv").config({path:path.join(__dirname,'../../.env'),quiet:true})

const {z} =require("zod")


const schema=z.object({
    NODE_ENV:z.enum(['development','test','production']).default('development'),
    PORT:z.coerce.number().int().positive().default(4000),
    DATABASE_URL:z.url(),
    // only the tests use a second database; production does not need one
    TEST_DATABASE_URL:z.url().optional(),
    JWT_SECRET:z.string().min(32),
    CLIENT_ORIGIN:z.url({protocol:/^https?$/}),
    LOG_LEVEL:z.enum(['fatal','error','warn','info','debug','trace','silent']).default("info")
}).refine((e)=>e.NODE_ENV!=='test'||e.TEST_DATABASE_URL,{
    message:'Required when NODE_ENV is test',
    path:['TEST_DATABASE_URL'],
})


const parsed=schema.safeParse(process.env)

if(!parsed.success){
    console.error("Invalid environment variables: ")
    for (const issue of parsed.error.issues) console.error(` ${issue.path.join('.')}: ${issue.message}`)
    process.exit(1)
}

const data=parsed.data
const env=Object.freeze(
    {
        ...data,
        databaseUrl:data.NODE_ENV==="test"?data.TEST_DATABASE_URL:data.DATABASE_URL,
        isProd:data.NODE_ENV==="production",
        isTest:data.NODE_ENV==="test"
    }
)

module.exports=env