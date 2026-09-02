import 'reflect-metadata'
import express from "express"
import { characterRouter } from "./character/character.routes.js" 
import {orm, syncSchema} from './shared/db/orm.js'
import { RequestContext } from '@mikro-orm/core'

const app = express()

//middleware
app.use(express.json())

//middleware
app.use((req, res, next) => {
    RequestContext.create(orm.em, next)
 
})


app.use('/api/characters', characterRouter) 


app.use((_, res) => {
    return res.status(404).json({ message: 'resource not found' })
})

await syncSchema()//never in production


app.listen(3000, () => {
    console.log("server is running on port http://localhost:3000")

})

