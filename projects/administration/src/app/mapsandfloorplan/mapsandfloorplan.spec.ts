import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { Mapsandfloorplan } from './mapsandfloorplan';

describe('Mapsandfloorplan', () => {
  let component: Mapsandfloorplan;
  let fixture: ComponentFixture<Mapsandfloorplan>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Mapsandfloorplan],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Mapsandfloorplan);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
