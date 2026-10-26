import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { NotesService } from "./notes.service";

@Controller("notes")
export class NotesController {
  constructor(private readonly notes: NotesService) {}
  @Get() list(@Query("kind") kind?: string) { return this.notes.list(kind); }
  @Post() create(@Body() body: Record<string, unknown>) { return this.notes.create(body ?? {}); }
  @Patch(":id") update(@Param("id") id: string, @Body() body: Record<string, unknown>) { return this.notes.update(id, body ?? {}); }
  @Delete(":id") remove(@Param("id") id: string) { return this.notes.delete(id); }
}
