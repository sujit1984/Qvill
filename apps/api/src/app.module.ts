import { Module } from "@nestjs/common";
import { DatabaseService } from "./database/database.service";
import { NotesController } from "./notes/notes.controller";
import { NotesService } from "./notes/notes.service";

@Module({
  controllers: [NotesController],
  providers: [DatabaseService, NotesService]
})
export class AppModule {}
